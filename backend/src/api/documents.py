from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import os
import uuid
from pathlib import Path
from src.storage.database import get_db
from src.services.document_service import DocumentService
from src.indexing.indexing_pipeline import IndexingPipeline
from src.models.schemas import Document, DocumentCreate, IndexingRequest
from src.models.enums import DocumentType, ChunkingStrategy
from src.utils.exceptions import IndexingError, DueDiligenceException
from src.workers.indexing_worker import index_document_task
from src.config import settings

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


@router.post("/upload", response_model=Document)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    auto_index: bool = Form(True),
    chunking_strategy: str = Form("PARAGRAPH"),
    db: Session = Depends(get_db)
):
    """Upload and optionally index a document"""
    try:
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")
        
        # Determine file type
        document_service = DocumentService(db)
        file_type = document_service.validate_file_type(file.filename)
        if not file_type:
            raise HTTPException(status_code=400, detail="Unsupported file type")
        
        # Create upload directory if it doesn't exist
        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix
        safe_filename = f"{file_id}{file_extension}"
        file_path = upload_dir / safe_filename
        
        # Save file
        try:
            with open(file_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")
        
        # Create document record
        document_data = DocumentCreate(
            filename=file.filename,
            file_type=file_type,
            title=file.filename,
            file_path=str(file_path),
            file_size=len(content)
        )
        
        document = document_service.create_document(document_data)
        
        # Auto-index if requested
        if auto_index:
            try:
                strategy = ChunkingStrategy(chunking_strategy)
                task = index_document_task.delay(str(document.id), strategy.value)
                
                return {
                    **document.__dict__,
                    "indexing_task_id": task.id,
                    "auto_index": True
                }
            except Exception as e:
                # Document created but indexing failed
                return {
                    **document.__dict__,
                    "indexing_error": str(e),
                    "auto_index": False
                }
        
        return document
        
    except HTTPException:
        raise
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/", response_model=List[Document])
async def get_documents(
    skip: int = 0,
    limit: int = 100,
    file_type: Optional[str] = None,
    indexed_only: bool = False,
    db: Session = Depends(get_db)
):
    """Get documents with optional filtering"""
    try:
        document_service = DocumentService(db)
        
        if file_type:
            try:
                doc_type = DocumentType(file_type)
                documents = document_service.get_documents_by_type(doc_type)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid file type")
        else:
            documents = document_service.get_documents(skip, limit)
        
        # Filter by indexed status if requested
        if indexed_only:
            documents = [doc for doc in documents if doc.indexed]
        
        return documents
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{document_id}", response_model=Document)
async def get_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get document by ID"""
    try:
        document_service = DocumentService(db)
        document = document_service.get_document(document_id)
        
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        return document
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{document_id}/index")
async def index_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    chunking_strategy: str = "PARAGRAPH",
    db: Session = Depends(get_db)
):
    """Index a document"""
    try:
        # Validate chunking strategy
        try:
            strategy = ChunkingStrategy(chunking_strategy)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid chunking strategy")
        
        # Start indexing task
        task = index_document_task.delay(document_id, strategy.value)
        
        return {
            "success": True,
            "task_id": task.id,
            "message": "Document indexing started",
            "chunking_strategy": chunking_strategy
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start indexing: {str(e)}")


@router.post("/{document_id}/reindex")
async def reindex_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    chunking_strategy: str = "PARAGRAPH",
    db: Session = Depends(get_db)
):
    """Reindex document with new chunking strategy"""
    try:
        # Validate chunking strategy
        try:
            strategy = ChunkingStrategy(chunking_strategy)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid chunking strategy")
        
        # Check if document exists
        document_service = DocumentService(db)
        document = document_service.get_document(document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Start reindexing task
        task = index_document_task.delay(document_id, strategy.value)
        
        return {
            "success": True,
            "task_id": task.id,
            "message": "Document reindexing started",
            "chunking_strategy": chunking_strategy
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to start reindexing: {str(e)}")


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Delete a document and its index"""
    try:
        document_service = DocumentService(db)
        success = document_service.delete_document(document_id)
        
        if success:
            return {"success": True, "message": "Document deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Document not found")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{document_id}/index-info")
async def get_document_index_info(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Get document indexing information"""
    try:
        pipeline = IndexingPipeline(db)
        index_info = pipeline.get_document_index_info(document_id)
        
        if "error" in index_info:
            raise HTTPException(status_code=404, detail=index_info["error"])
        
        return index_info
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{document_id}/content")
async def get_document_content(
    document_id: str,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get document chunks/content"""
    try:
        pipeline = IndexingPipeline(db)
        chunks = pipeline.get_document_chunks(document_id, limit)
        
        return {
            "document_id": document_id,
            "chunks": chunks,
            "total_chunks": len(chunks)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/search")
async def search_documents(
    query: str,
    document_ids: Optional[List[str]] = None,
    top_k: int = 10,
    db: Session = Depends(get_db)
):
    """Search across indexed documents"""
    try:
        pipeline = IndexingPipeline(db)
        results = pipeline.search_documents(query, document_ids, top_k)
        
        return {
            "query": query,
            "document_ids": document_ids,
            "top_k": top_k,
            "results": results,
            "total_results": len(results)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{document_id}/download")
async def download_document(
    document_id: str,
    db: Session = Depends(get_db)
):
    """Download document file"""
    try:
        document_service = DocumentService(db)
        file_path = document_service.get_file_path(document_id)
        
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Document file not found")
        
        from fastapi.responses import FileResponse
        return FileResponse(
            path=file_path,
            filename=os.path.basename(file_path),
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/types/supported")
async def get_supported_document_types():
    """Get list of supported document types"""
    return {
        "supported_types": [
            {
                "type": "PDF",
                "description": "PDF documents",
                "extensions": [".pdf"]
            },
            {
                "type": "DOCX",
                "description": "Microsoft Word documents",
                "extensions": [".docx"]
            },
            {
                "type": "XLSX",
                "description": "Microsoft Excel spreadsheets",
                "extensions": [".xlsx"]
            },
            {
                "type": "PPTX",
                "description": "Microsoft PowerPoint presentations",
                "extensions": [".pptx"]
            }
        ]
    }


@router.get("/chunking/strategies")
async def get_chunking_strategies():
    """Get available chunking strategies"""
    return {
        "strategies": [
            {
                "name": "FIXED_SIZE",
                "description": "Fixed-size chunks with overlap",
                "recommended_for": "General documents, predictable chunk sizes"
            },
            {
                "name": "SENTENCE",
                "description": "Sentence-based chunking",
                "recommended_for": "Legal documents, contracts, structured text"
            },
            {
                "name": "PARAGRAPH",
                "description": "Paragraph-based chunking",
                "recommended_for": "Articles, reports, narrative text"
            },
            {
                "name": "SEMANTIC",
                "description": "Semantic boundary detection",
                "recommended_for": "Complex documents, mixed content types"
            }
        ]
    }
