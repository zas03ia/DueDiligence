from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    DateTime,
    Boolean,
    Integer,
    Float,
    Text,
    JSON,
    ForeignKey,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from uuid import uuid4
from src.storage.database import Base
from src.models.enums import (
    ProjectStatus,
    AnswerStatus,
    RequestStatus,
    DocumentType,
    QuestionType,
)


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    document_scope = Column(JSON, default=list)
    status = Column(String(20), default=ProjectStatus.DRAFT)
    questionnaire_id = Column(
        UUID(as_uuid=True), ForeignKey("questionnaires.id"), nullable=True
    )
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    questionnaire = relationship("Questionnaire", back_populates="projects")
    answers = relationship("Answer", back_populates="project")
    requests = relationship("Request", back_populates="project")


class Questionnaire(Base):
    __tablename__ = "questionnaires"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    file_path = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    projects = relationship("Project", back_populates="questionnaire")
    questions = relationship("Question", back_populates="questionnaire")


class Question(Base):
    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    questionnaire_id = Column(
        UUID(as_uuid=True), ForeignKey("questionnaires.id"), nullable=False
    )
    text = Column(Text, nullable=False)
    question_type = Column(String(20), nullable=False)
    section = Column(String(255))
    order = Column(Integer, nullable=False)
    options = Column(JSON)  # For multiple choice questions
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    questionnaire = relationship("Questionnaire", back_populates="questions")
    answers = relationship("Answer", back_populates="question")


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(10), nullable=False)
    title = Column(String(255))
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    document_metadata = Column(JSON, default=dict)
    indexed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    requests = relationship("Request", back_populates="document")


class Answer(Base):
    __tablename__ = "answers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    question_id = Column(UUID(as_uuid=True), ForeignKey("questions.id"), nullable=False)
    answer_text = Column(Text)
    manual_answer = Column(Text)
    confidence_score = Column(Float, nullable=False)
    is_answerable = Column(Boolean, nullable=False)
    citations = Column(JSON, default=list)
    status = Column(String(20), default=AnswerStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="answers")
    question = relationship("Question", back_populates="answers")


class Request(Base):
    __tablename__ = "requests"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    request_type = Column(String(50), nullable=False)
    status = Column(String(20), default=RequestStatus.PENDING)
    progress = Column(Float, default=0.0)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id"), nullable=True)
    result_data = Column(JSON)
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    project = relationship("Project", back_populates="requests")
    document = relationship("Document", back_populates="requests")
