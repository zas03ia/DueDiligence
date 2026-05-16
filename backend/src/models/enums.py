from enum import Enum


class ProjectStatus(str, Enum):
    """Project lifecycle status"""
    DRAFT = "DRAFT"
    INDEXING = "INDEXING"
    READY = "READY"
    GENERATING = "GENERATING"
    COMPLETED = "COMPLETED"
    OUTDATED = "OUTDATED"
    ERROR = "ERROR"


class AnswerStatus(str, Enum):
    """Answer review status"""
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    REJECTED = "REJECTED"
    MANUAL_UPDATED = "MANUAL_UPDATED"
    MISSING_DATA = "MISSING_DATA"


class RequestStatus(str, Enum):
    """Background request status"""
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class DocumentType(str, Enum):
    """Supported document types"""
    PDF = "PDF"
    DOCX = "DOCX"
    XLSX = "XLSX"
    PPTX = "PPTX"


class QuestionType(str, Enum):
    """Question types"""
    TEXT = "TEXT"
    BOOLEAN = "BOOLEAN"
    NUMERIC = "NUMERIC"
    DATE = "DATE"
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"


class ChunkingStrategy(str, Enum):
    """Document chunking strategies"""
    FIXED_SIZE = "FIXED_SIZE"
    SENTENCE = "SENTENCE"
    PARAGRAPH = "PARAGRAPH"
    SEMANTIC = "SEMANTIC"
