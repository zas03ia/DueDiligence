"""Shared pytest fixtures for API integration tests."""

import os
import shutil
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Configure environment before application imports
BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("GROQ_API_KEY", "test-groq-api-key")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("UPLOAD_DIR", str(BACKEND_ROOT / "tests" / "test_uploads"))

# Avoid loading heavy embedding models during test collection
_mock_embeddings = MagicMock()
_mock_embeddings.generate_embeddings.side_effect = lambda chunks: chunks
_mock_embeddings.generate_single_embedding.return_value = [0.0] * 384
sys.modules.setdefault("sentence_transformers", MagicMock())


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


TEST_UPLOADS_DIR = BACKEND_ROOT / "tests" / "test_uploads"


def _clean_upload_directory(upload_path: Path) -> None:
    """Remove all files and subdirectories created during tests."""
    if not upload_path.exists():
        return
    for item in upload_path.iterdir():
        if item.is_file():
            item.unlink(missing_ok=True)
        elif item.is_dir():
            shutil.rmtree(item, ignore_errors=True)


@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    return engine


@pytest.fixture(scope="session")
def tables(test_engine):
    import src.storage.database as database
    from src.storage.database import Base

    database.engine = test_engine
    database.SessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=test_engine
    )
    import src.models.db_models  # noqa: F401 — register ORM models on Base
    import src.workers.indexing_worker  # noqa: F401
    import src.workers.answer_worker  # noqa: F401
    from app import app  # noqa: F401

    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    _clean_upload_directory(TEST_UPLOADS_DIR)
    if TEST_UPLOADS_DIR.exists():
        shutil.rmtree(TEST_UPLOADS_DIR, ignore_errors=True)


@pytest.fixture
def db_session(tables, test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def upload_dir():
    """Isolated upload folder; wiped after each test."""
    TEST_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    yield TEST_UPLOADS_DIR
    _clean_upload_directory(TEST_UPLOADS_DIR)


@pytest.fixture
def client(db_session, upload_dir, monkeypatch):
    from src.config import settings
    from src.storage.database import get_db
    from app import app
    import src.workers.indexing_worker as indexing_worker
    import src.workers.answer_worker as answer_worker
    import src.indexing.vector_index as vector_index

    settings.upload_dir = str(upload_dir)

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    class FakeAsyncResult:
        id = "test-celery-task-id"

    def fake_delay(*_args, **_kwargs):
        return FakeAsyncResult()

    monkeypatch.setattr(indexing_worker.index_document_task, "delay", fake_delay)
    monkeypatch.setattr(answer_worker.generate_all_answers_task, "delay", fake_delay)
    monkeypatch.setattr(answer_worker.generate_single_answer_task, "delay", fake_delay)

    monkeypatch.setattr(
        vector_index.vector_index_manager,
        "get_index_statistics",
        lambda _document_id: {"chunk_count": 0, "indexed": False},
    )
    monkeypatch.setattr(
        vector_index.vector_index_manager,
        "get_document_chunks",
        lambda _document_id, limit=100: [],
    )
    monkeypatch.setattr(
        vector_index.vector_index_manager,
        "search_across_documents",
        lambda **_kwargs: [],
    )

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_questionnaire(db_session):
    from src.models.db_models import Questionnaire, Question
    from src.models.enums import QuestionType

    questionnaire = Questionnaire(
        name="Test Questionnaire",
        description="Sample questionnaire for tests",
        file_path="/tmp/test-questionnaire.pdf",
    )
    db_session.add(questionnaire)
    db_session.flush()

    questions = [
        Question(
            questionnaire_id=questionnaire.id,
            text="What is the fund's investment strategy?",
            question_type=QuestionType.TEXT.value,
            section="General",
            order=1,
        ),
        Question(
            questionnaire_id=questionnaire.id,
            text="Is the fund SEC registered?",
            question_type=QuestionType.BOOLEAN.value,
            section="Compliance",
            order=2,
        ),
    ]
    db_session.add_all(questions)
    db_session.commit()
    db_session.refresh(questionnaire)
    for question in questions:
        db_session.refresh(question)
    return questionnaire, questions


@pytest.fixture
def sample_project(db_session, sample_questionnaire):
    from src.models.db_models import Project
    from src.models.enums import ProjectStatus

    questionnaire, _questions = sample_questionnaire
    project = Project(
        name="Test Due Diligence Project",
        description="Integration test project",
        document_scope=[],
        status=ProjectStatus.DRAFT.value,
        questionnaire_id=questionnaire.id,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


@pytest.fixture
def sample_answer(db_session, sample_project, sample_questionnaire):
    from src.models.db_models import Answer
    from src.models.enums import AnswerStatus

    _questionnaire, questions = sample_questionnaire
    answer = Answer(
        project_id=sample_project.id,
        question_id=questions[0].id,
        answer_text="Sample AI-generated answer.",
        confidence_score=0.85,
        is_answerable=True,
        citations=[{"chunk_id": "chunk-1", "document_id": "doc-1"}],
        status=AnswerStatus.PENDING.value,
    )
    db_session.add(answer)
    db_session.commit()
    db_session.refresh(answer)
    return answer


@pytest.fixture
def sample_document_file(upload_dir):
    path = upload_dir / "sample.pdf"
    path.write_bytes(b"%PDF-1.4 minimal test content")
    yield path
    path.unlink(missing_ok=True)
