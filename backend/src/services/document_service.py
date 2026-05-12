from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from src.models.db_models import Document, Request
from src.models.schemas import DocumentCreate
from src.models.enums import RequestStatus, DocumentType
import os
from pathlib import Path


class DocumentService:
    """Service for managing documents"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_document(self, document_data: DocumentCreate) -> Document:
        """Create a new document record"""
        document = Document(**document_data.dict())
        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)
        return document
    
    def get_document(self, document_id: UUID) -> Optional[Document]:
        """Get document by ID"""
        return self.db.query(Document).filter(Document.id == document_id).first()
    
    def get_documents(self, skip: int = 0, limit: int = 100) -> List[Document]:
        """Get all documents with pagination"""
        return self.db.query(Document).offset(skip).limit(limit).all()
    
    def get_documents_by_type(self, file_type: DocumentType) -> List[Document]:
        """Get documents by type"""
        return self.db.query(Document).filter(Document.file_type == file_type).all()
    
    def update_document_indexed(self, document_id: UUID, indexed: bool = True) -> bool:
        """Update document indexed status"""
        document = self.get_document(document_id)
        if not document:
            return False
        
        document.indexed = indexed
        self.db.commit()
        return True
    
    def delete_document(self, document_id: UUID) -> bool:
        """Delete document and file"""
        document = self.get_document(document_id)
        if not document:
            return False
        
        # Delete file from filesystem
        try:
            if os.path.exists(document.file_path):
                os.remove(document.file_path)
        except Exception as e:
            print(f"Error deleting file: {e}")
        
        # Delete from database
        self.db.delete(document)
        self.db.commit()
        return True
    
    def get_file_path(self, document_id: UUID) -> Optional[str]:
        """Get file path for document"""
        document = self.get_document(document_id)
        return document.file_path if document else None
    
    def validate_file_type(self, filename: str) -> Optional[DocumentType]:
        """Validate and return file type"""
        ext = Path(filename).suffix.lower()
        type_mapping = {
            '.pdf': DocumentType.PDF,
            '.docx': DocumentType.DOCX,
            '.xlsx': DocumentType.XLSX,
            '.pptx': DocumentType.PPTX
        }
        return type_mapping.get(ext)
    
    def create_indexing_request(self, document_id: UUID) -> Request:
        """Create indexing request for document"""
        request = Request(
            request_type="INDEX_DOCUMENT",
            document_id=document_id,
            status=RequestStatus.PENDING
        )
        self.db.add(request)
        self.db.commit()
        self.db.refresh(request)
        return request
