from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from src.storage.database import get_db
from src.models.db_models import Request

router = APIRouter(prefix="/api/v1/requests", tags=["requests"])


def _serialize(r: Request) -> dict:
    return {
        "id": str(r.id),
        "request_type": r.request_type,
        "status": r.status,
        "progress": r.progress,
        "project_id": str(r.project_id) if r.project_id else None,
        "document_id": str(r.document_id) if r.document_id else None,
        "result_data": r.result_data,
        "error_message": r.error_message,
        "created_at": r.created_at,
        "updated_at": r.updated_at,
    }


@router.get("/")
async def list_requests(skip: int = 0, limit: int = 50, db: Session = Depends(get_db)):
    """List all requests/tasks, newest first"""
    requests = (
        db.query(Request)
        .order_by(Request.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialize(r) for r in requests]


@router.get("/{request_id}")
async def get_request(request_id: str, db: Session = Depends(get_db)):
    """Get a single request/task by ID"""
    request = db.query(Request).filter(Request.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    return _serialize(request)


@router.get("/project/{project_id}")
async def get_project_requests(
    project_id: str, skip: int = 0, limit: int = 50, db: Session = Depends(get_db)
):
    """Get all requests/tasks for a project, newest first"""
    requests = (
        db.query(Request)
        .filter(Request.project_id == project_id)
        .order_by(Request.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_serialize(r) for r in requests]
