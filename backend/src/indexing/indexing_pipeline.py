import os
import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from src.models.db_models import Document, Request, Questionnaire, Question
from src.models.enums import DocumentType, RequestStatus
from src.services.document_service import DocumentService
from src.indexing.document_parser import DocumentParser
from src.indexing.chunking import DocumentChunker, ChunkingStrategy
from src.indexing.embeddings import embedding_generator
from src.indexing.vector_index import vector_index_manager
from src.indexing.questionnaire_parser import questionnaire_parser
from src.utils.exceptions import IndexingError, GenerationError
from src.config import settings
import time


class IndexingPipeline:
    """Complete indexing pipeline for documents and questionnaires"""
    
    def __init__(self, db: Session):
        self.db = db
        self.document_service = DocumentService(db)
        self.document_parser = DocumentParser()
        self.chunker = DocumentChunker()
    
    def index_document(self, document_id: str, chunking_strategy: ChunkingStrategy = ChunkingStrategy.PARAGRAPH) -> Dict[str, Any]:
        """Complete document indexing pipeline"""
        start_time = time.time()
        
        try:
            # Get document from database
            document = self.document_service.get_document(document_id)
            if not document:
                raise IndexingError(f"Document not found: {document_id}")
            
            # Update request status to running
            request = self.document_service.create_indexing_request(document_id)
            self._update_request_status(request.id, RequestStatus.RUNNING, 0.1)
            
            # Step 1: Parse document
            parsed_content = self.document_parser.parse_document(document.file_path, DocumentType(document.file_type))
            self._update_request_status(request.id, RequestStatus.RUNNING, 0.3)
            
            # Step 2: Chunk document
            chunks = self.chunker.chunk_document(parsed_content, chunking_strategy)
            self._update_request_status(request.id, RequestStatus.RUNNING, 0.5)
            
            # Step 3: Generate embeddings
            chunks_with_embeddings = embedding_generator.generate_embeddings(chunks)
            self._update_request_status(request.id, RequestStatus.RUNNING, 0.7)
            
            # Step 4: Index in vector store
            success = vector_index_manager.index_document_chunks(document_id, chunks_with_embeddings)
            if not success:
                raise IndexingError("Failed to index document chunks in vector store")
            
            # Step 5: Create citation index
            vector_index_manager.create_citation_index(document_id, chunks_with_embeddings)
            self._update_request_status(request.id, RequestStatus.RUNNING, 0.9)
            
            # Step 6: Update document status
            self.document_service.update_document_indexed(document_id, True)
            
            # Step 7: Mark related projects as outdated
            self._mark_projects_outdated(document_id)
            
            # Complete request
            processing_time = time.time() - start_time
            self._update_request_status(request.id, RequestStatus.COMPLETED, 1.0, {
                "chunks_created": len(chunks),
                "processing_time": processing_time,
                "chunking_strategy": chunking_strategy
            })
            
            return {
                "success": True,
                "document_id": document_id,
                "chunks_created": len(chunks),
                "processing_time": processing_time,
                "chunking_strategy": chunking_strategy,
                "request_id": request.id
            }
            
        except Exception as e:
            # Update request status to failed
            if 'request' in locals():
                self._update_request_status(request.id, RequestStatus.FAILED, 0.0, error_message=str(e))
            raise IndexingError(f"Document indexing failed: {str(e)}")
    
    def index_questionnaire(self, file_path: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Index questionnaire and create questionnaire record"""
        try:
            # Parse questionnaire
            questionnaire_data = questionnaire_parser.parse_questionnaire(file_path)
            
            # Create questionnaire record
            questionnaire = Questionnaire(
                name=name or questionnaire_data["filename"],
                description=f"Questionnaire with {questionnaire_data['total_questions']} questions",
                file_path=file_path
            )
            
            self.db.add(questionnaire)
            self.db.flush()  # Get the ID
            
            # Create question records
            questions = []
            for q_data in questionnaire_data["questions"]:
                question = Question(
                    questionnaire_id=questionnaire.id,
                    text=q_data["text"],
                    question_type=q_data["question_type"],
                    section=q_data["section"],
                    order=q_data["order"],
                    options=q_data["options"]
                )
                questions.append(question)
            
            self.db.add_all(questions)
            self.db.commit()
            
            return {
                "success": True,
                "questionnaire_id": str(questionnaire.id),
                "name": questionnaire.name,
                "total_questions": len(questions),
                "sections": questionnaire_data["sections"]
            }
            
        except Exception as e:
            self.db.rollback()
            raise IndexingError(f"Questionnaire indexing failed: {str(e)}")
    
    def reindex_document(self, document_id: str, new_chunking_strategy: ChunkingStrategy) -> Dict[str, Any]:
        """Reindex document with new chunking strategy"""
        try:
            # Delete existing index
            vector_index_manager.delete_document_index(document_id)
            
            # Reindex with new strategy
            return self.index_document(document_id, new_chunking_strategy)
            
        except Exception as e:
            raise IndexingError(f"Document reindexing failed: {str(e)}")
    
    def get_indexing_status(self, request_id: str) -> Dict[str, Any]:
        """Get status of indexing request"""
        request = self.db.query(Request).filter(Request.id == request_id).first()
        if not request:
            return {"error": "Request not found"}
        
        return {
            "request_id": request.id,
            "status": request.status,
            "progress": request.progress,
            "result_data": request.result_data,
            "error_message": request.error_message,
            "created_at": request.created_at,
            "updated_at": request.updated_at
        }
    
    def get_document_index_info(self, document_id: str) -> Dict[str, Any]:
        """Get information about document index"""
        try:
            # Get document from database
            document = self.document_service.get_document(document_id)
            if not document:
                return {"error": "Document not found"}
            
            # Get index statistics
            index_stats = vector_index_manager.get_index_statistics(document_id)
            
            return {
                "document_id": document_id,
                "filename": document.filename,
                "file_type": document.file_type,
                "indexed": document.indexed,
                "index_statistics": index_stats,
                "file_size": document.file_size,
                "metadata": document.metadata
            }
            
        except Exception as e:
            return {"error": f"Failed to get index info: {str(e)}"}
    
    def search_documents(self, query_text: str, document_ids: Optional[List[str]] = None, 
                        top_k: int = 10) -> List[Dict[str, Any]]:
        """Search across indexed documents"""
        try:
            if not document_ids:
                # Get all indexed documents
                documents = self.document_service.get_documents()
                document_ids = [str(doc.id) for doc in documents if doc.indexed]
            
            if not document_ids:
                return []
            
            # Search across documents
            results = vector_index_manager.search_across_documents(
                document_ids=document_ids,
                query_text=query_text,
                top_k=top_k
            )
            
            return results
            
        except Exception as e:
            raise IndexingError(f"Document search failed: {str(e)}")
    
    def get_citation_context(self, document_id: str, chunk_id: str) -> Dict[str, Any]:
        """Get citation context for a chunk"""
        try:
            return vector_index_manager.get_citation_context(document_id, chunk_id)
        except Exception as e:
            raise IndexingError(f"Failed to get citation context: {str(e)}")
    
    def _update_request_status(self, request_id: str, status: RequestStatus, 
                             progress: float, result_data: Optional[Dict[str, Any]] = None,
                             error_message: Optional[str] = None):
        """Update request status in database"""
        request = self.db.query(Request).filter(Request.id == request_id).first()
        if request:
            request.status = status
            request.progress = progress
            if result_data:
                request.result_data = result_data
            if error_message:
                request.error_message = error_message
            self.db.commit()
    
    def _mark_projects_outdated(self, document_id: str):
        """Mark projects using this document as outdated"""
        # This is a placeholder - in a real implementation, you'd need to track
        # which projects use which documents
        pass
    
    def batch_index_documents(self, document_ids: List[str], 
                           chunking_strategy: ChunkingStrategy = ChunkingStrategy.PARAGRAPH) -> List[Dict[str, Any]]:
        """Index multiple documents in batch"""
        results = []
        
        for doc_id in document_ids:
            try:
                result = self.index_document(doc_id, chunking_strategy)
                results.append(result)
            except Exception as e:
                results.append({
                    "success": False,
                    "document_id": doc_id,
                    "error": str(e)
                })
        
        return results
    
    def validate_indexing_pipeline(self) -> Dict[str, Any]:
        """Validate indexing pipeline components"""
        validation_results = {}
        
        # Test document parser
        try:
            test_file = "test.txt"
            with open(test_file, 'w') as f:
                f.write("Test document content")
            
            parsed = self.document_parser.parse_document(test_file, DocumentType.PDF)
            validation_results["document_parser"] = {"status": "OK", "message": "Parser working"}
            os.remove(test_file)
        except Exception as e:
            validation_results["document_parser"] = {"status": "ERROR", "message": str(e)}
        
        # Test chunker
        try:
            test_content = {"text_content": [{"text": "Test content for chunking."}]}
            chunks = self.chunker.chunk_document(test_content)
            validation_results["chunker"] = {"status": "OK", "chunks_created": len(chunks)}
        except Exception as e:
            validation_results["chunker"] = {"status": "ERROR", "message": str(e)}
        
        # Test embedding generator
        try:
            test_embedding = embedding_generator.generate_single_embedding("Test text")
            validation_results["embeddings"] = {"status": "OK", "dimension": len(test_embedding)}
        except Exception as e:
            validation_results["embeddings"] = {"status": "ERROR", "message": str(e)}
        
        # Test vector store
        try:
            stats = vector_index_manager.get_index_statistics("test_doc")
            validation_results["vector_store"] = {"status": "OK", "message": "Vector store accessible"}
        except Exception as e:
            validation_results["vector_store"] = {"status": "ERROR", "message": str(e)}
        
        return validation_results
