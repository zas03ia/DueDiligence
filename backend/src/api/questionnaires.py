from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from src.storage.database import get_db
from src.models.db_models import Questionnaire, Question
from src.indexing.indexing_pipeline import IndexingPipeline
from src.config import settings
from pathlib import Path
import uuid

router = APIRouter(prefix="/api/v1/questionnaires", tags=["questionnaires"])


@router.get("/")
async def list_questionnaires(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """List all available questionnaires"""
    questionnaires = db.query(Questionnaire).offset(skip).limit(limit).all()
    return [
        {
            "id": str(q.id),
            "name": q.name,
            "description": q.description,
            "file_path": q.file_path,
            "question_count": db.query(Question).filter(Question.questionnaire_id == q.id).count(),
            "created_at": q.created_at,
            "updated_at": q.updated_at,
        }
        for q in questionnaires
    ]


@router.get("/{questionnaire_id}")
async def get_questionnaire(
    questionnaire_id: str,
    db: Session = Depends(get_db)
):
    """Get a questionnaire with its questions"""
    questionnaire = db.query(Questionnaire).filter(
        Questionnaire.id == questionnaire_id
    ).first()
    if not questionnaire:
        raise HTTPException(status_code=404, detail="Questionnaire not found")

    questions = (
        db.query(Question)
        .filter(Question.questionnaire_id == questionnaire.id)
        .order_by(Question.order)
        .all()
    )
    return {
        "id": str(questionnaire.id),
        "name": questionnaire.name,
        "description": questionnaire.description,
        "file_path": questionnaire.file_path,
        "created_at": questionnaire.created_at,
        "updated_at": questionnaire.updated_at,
        "questions": [
            {
                "id": str(q.id),
                "text": q.text,
                "question_type": q.question_type,
                "section": q.section,
                "order": q.order,
                "options": q.options,
            }
            for q in questions
        ],
        "total_questions": len(questions),
    }


@router.post("/upload")
async def upload_questionnaire(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload and parse a questionnaire PDF/DOCX into questions"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX questionnaires are supported")

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    dest = upload_dir / f"{file_id}{suffix}"
    content = await file.read()
    dest.write_bytes(content)

    try:
        pipeline = IndexingPipeline(db)
        result = pipeline.index_questionnaire(str(dest), name=Path(file.filename).stem)
        return result
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse questionnaire: {str(e)}")
