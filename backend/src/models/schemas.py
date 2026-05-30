from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_serializer, field_validator
from .enums import (
    ProjectStatus,
    AnswerStatus,
    RequestStatus,
    DocumentType,
    QuestionType,
)


# Base Models
class BaseSchema(BaseModel):
    class Config:
        from_attributes = True


# Project Models
class ProjectBase(BaseSchema):
    name: str = Field(..., description="Project name")
    description: Optional[str] = Field(None, description="Project description")
    document_scope: Optional[List[str]] = Field(
        default_factory=list, description="List of document IDs to include"
    )
    status: ProjectStatus = Field(
        default=ProjectStatus.DRAFT, description="Project status"
    )


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseSchema):
    name: Optional[str] = None
    description: Optional[str] = None
    document_scope: Optional[List[str]] = None
    status: Optional[ProjectStatus] = None


class Project(ProjectBase):
    id: str
    created_at: datetime
    updated_at: datetime
    questionnaire_id: Optional[str] = None

    @field_validator("id", "questionnaire_id", mode="before")
    @classmethod
    def coerce_uuid_fields(cls, value: Optional[object]) -> Optional[str]:
        if value is None:
            return None
        return str(value)


# Document Models
class DocumentBase(BaseSchema):
    filename: str = Field(..., description="Original filename")
    file_type: DocumentType = Field(..., description="Document type")
    title: Optional[str] = Field(None, description="Document title")
    file_size: int = Field(..., description="File size in bytes")
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Document metadata",
        validation_alias="document_metadata",
    )


class DocumentCreate(DocumentBase):
    file_path: str = Field(..., description="Path to uploaded file")


class Document(DocumentBase):
    id: str
    file_path: str
    indexed: bool = False
    created_at: datetime
    updated_at: datetime

    @field_validator("id", mode="before")
    @classmethod
    def coerce_uuid_fields(cls, value: object) -> str:
        return str(value)


class DocumentUploadResponse(BaseSchema):
    document: Document
    indexing_task_id: Optional[str] = None
    indexing_error: Optional[str] = None
    auto_index: bool = False


# Question Models
class QuestionBase(BaseSchema):
    text: str = Field(..., description="Question text")
    question_type: QuestionType = Field(..., description="Question type")
    section: Optional[str] = Field(None, description="Question section")
    order: int = Field(..., description="Question order in section")
    options: Optional[List[str]] = Field(None, description="Multiple choice options")


class Question(QuestionBase):
    id: str
    questionnaire_id: str
    created_at: datetime

    @field_validator("id", "questionnaire_id", mode="before")
    @classmethod
    def coerce_uuid_fields(cls, value: object) -> str:
        return str(value)


# Answer Models
class AnswerBase(BaseSchema):
    question_id: str = Field(..., description="Question ID")
    answer_text: Optional[str] = Field(None, description="Generated answer text")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    is_answerable: bool = Field(..., description="Whether answer can be generated")
    citations: Optional[List[Dict[str, Any]]] = Field(
        default_factory=list, description="Citation references"
    )
    status: AnswerStatus = Field(
        default=AnswerStatus.PENDING, description="Answer status"
    )


class AnswerCreate(AnswerBase):
    pass


class AnswerUpdate(BaseSchema):
    answer_text: Optional[str] = None
    confidence_score: Optional[float] = None
    is_answerable: Optional[bool] = None
    citations: Optional[List[Dict[str, Any]]] = None
    status: Optional[AnswerStatus] = None
    manual_answer: Optional[str] = None


class Answer(AnswerBase):
    id: str
    project_id: str
    manual_answer: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_validator("id", "project_id", "question_id", mode="before")
    @classmethod
    def coerce_uuid_fields(cls, value: object) -> str:
        return str(value)


# Request Models
class RequestBase(BaseSchema):
    request_type: str = Field(..., description="Type of request")
    status: RequestStatus = Field(
        default=RequestStatus.PENDING, description="Request status"
    )
    progress: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Progress percentage"
    )


class RequestCreate(RequestBase):
    pass


class Request(RequestBase):
    id: str
    project_id: Optional[str] = None
    document_id: Optional[str] = None
    result_data: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("id", "project_id", "document_id")
    def serialize_uuid(self, value: Optional[object]) -> Optional[str]:
        if value is None:
            return None
        return str(value)


# API Response Models
class ProjectResponse(BaseSchema):
    project: Project
    questions: List[Question]
    answers: List[Answer]
    status: ProjectStatus


class GenerationRequest(BaseSchema):
    project_id: str
    question_ids: Optional[List[str]] = None  # If None, generate all answers


class IndexingRequest(BaseSchema):
    document_id: str
    chunking_strategy: str = "PARAGRAPH"


class EvaluationRequest(BaseSchema):
    project_id: str
    ground_truth_answers: Dict[str, str]  # question_id -> answer


class EvaluationResponse(BaseSchema):
    overall_score: float
    question_scores: Optional[Dict[str, float]] = None
    similarity_metrics: Dict[str, Any]
    detailed_comparison: Optional[List[Dict[str, Any]]] = None

    # Additional fields returned by evaluation service
    project_id: Optional[str] = None
    avg_confidence: Optional[float] = None
    total_questions: Optional[int] = None
    evaluated_questions: Optional[int] = None
    answerable_rate: Optional[float] = None
    question_evaluations: Optional[List[Dict[str, Any]]] = None
    evaluation_report: Optional[Dict[str, Any]] = None
