from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
import os
import uuid
import json
import asyncio
from pathlib import Path
from src.storage.database import get_db, SessionLocal
from src.services.document_service import DocumentService
from src.indexing.indexing_pipeline import IndexingPipeline
from src.models.schemas import Document, DocumentCreate, IndexingRequest
from src.models.enums import DocumentType, ChunkingStrategy
from src.utils.exceptions import IndexingError, DueDiligenceException
from src.config import settings

router = APIRouter(prefix="/api/v1/documents", tags=["documents"])


def _run_indexing_background(document_id: str, strategy_value: str):
    """Run indexing in a background task with its own DB session"""
    db = SessionLocal()
    try:
        from src.indexing.indexing_pipeline import IndexingPipeline
        from src.models.enums import ChunkingStrategy
        pipeline = IndexingPipeline(db)
        pipeline.index_document(document_id, ChunkingStrategy(strategy_value))
    except Exception as e:
        print(f"Background indexing failed for {document_id}: {e}")
    finally:
        db.close()


@router.post("/upload", response_model=Document)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    auto_index: bool = Form(True),
    chunking_strategy: str = Form("PARAGRAPH"),
    db: Session = Depends(get_db)
):
    """Upload a document. Indexing runs in the background — check /documents/{id} for indexed status."""
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No filename provided")

        document_service = DocumentService(db)
        file_type = document_service.validate_file_type(file.filename)
        if not file_type:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        upload_dir = Path(settings.upload_dir)
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_id = str(uuid.uuid4())
        file_extension = Path(file.filename).suffix
        file_path = upload_dir / f"{file_id}{file_extension}"

        content = await file.read()
        with open(file_path, "wb") as buffer:
            buffer.write(content)

        document_data = DocumentCreate(
            filename=file.filename,
            file_type=file_type,
            title=file.filename,
            file_path=str(file_path),
            file_size=len(content)
        )
        document = document_service.create_document(document_data)

        if auto_index:
            # Validate strategy before queuing so we fail fast
            try:
                ChunkingStrategy(chunking_strategy)
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid chunking strategy")
            background_tasks.add_task(_run_indexing_background, str(document.id), chunking_strategy)

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
    """Queue document indexing as a background task. Poll GET /{id} or stream /{id}/index/stream for progress."""
    try:
        ChunkingStrategy(chunking_strategy)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid chunking strategy")

    document_service = DocumentService(db)
    if not document_service.get_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found")

    background_tasks.add_task(_run_indexing_background, document_id, chunking_strategy)
    return {"success": True, "message": "Indexing started in background", "document_id": document_id}


@router.post("/{document_id}/reindex")
async def reindex_document(
    document_id: str,
    background_tasks: BackgroundTasks,
    chunking_strategy: str = "PARAGRAPH",
    db: Session = Depends(get_db)
):
    """Queue document reindexing as a background task."""
    try:
        ChunkingStrategy(chunking_strategy)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid chunking strategy")

    document_service = DocumentService(db)
    if not document_service.get_document(document_id):
        raise HTTPException(status_code=404, detail="Document not found")

    background_tasks.add_task(_run_indexing_background, document_id, chunking_strategy)
    return {"success": True, "message": "Reindexing started in background", "document_id": document_id}


@router.get("/{document_id}/index/stream")
async def stream_indexing_status(
    document_id: str,
    db: Session = Depends(get_db)
):
    """SSE stream that emits the document's indexed status every 2s until indexed=true or timeout."""
    async def event_generator():
        document_service = DocumentService(db)
        for _ in range(60):  # max 2 minutes
            doc = document_service.get_document(document_id)
            if not doc:
                yield f"data: {json.dumps({'error': 'Document not found'})}\n\n"
                return
            payload = {"document_id": document_id, "indexed": doc.indexed}
            yield f"data: {json.dumps(payload)}\n\n"
            if doc.indexed:
                return
            await asyncio.sleep(2)
        yield f"data: {json.dumps({'document_id': document_id, 'indexed': False, 'timeout': True})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


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
