from celery import Celery
from sqlalchemy.orm import Session
from src.config import settings
from src.storage.database import SessionLocal
from src.indexing.indexing_pipeline import IndexingPipeline
from src.models.enums import ChunkingStrategy

# Initialize Celery
celery_app = Celery(
    "indexing_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(bind=True)
def index_document_task(self, document_id: str, chunking_strategy: str = "PARAGRAPH"):
    """Background task for document indexing"""
    db = SessionLocal()
    try:
        strategy = ChunkingStrategy(chunking_strategy)
        pipeline = IndexingPipeline(db)
        result = pipeline.index_document(document_id, strategy)
        return result
    except Exception as e:
        # Update task status to failure
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def index_questionnaire_task(self, file_path: str, name: str = None):
    """Background task for questionnaire indexing"""
    db = SessionLocal()
    try:
        pipeline = IndexingPipeline(db)
        result = pipeline.index_questionnaire(file_path, name)
        return result
    except Exception as e:
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def batch_index_documents_task(self, document_ids: list, chunking_strategy: str = "PARAGRAPH"):
    """Background task for batch document indexing"""
    db = SessionLocal()
    try:
        strategy = ChunkingStrategy(chunking_strategy)
        pipeline = IndexingPipeline(db)
        results = pipeline.batch_index_documents(document_ids, strategy)
        return results
    except Exception as e:
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()
