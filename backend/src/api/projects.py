from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from src.storage.database import get_db, SessionLocal
from src.services.project_service import ProjectService
from src.services.answer_generation_service import get_answer_generation_service
from src.models.schemas import (
    Project, ProjectCreate, ProjectUpdate, ProjectResponse, GenerationRequest
)
from src.models.db_models import Questionnaire, Question, Answer
from src.utils.exceptions import DueDiligenceException

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

# Single-thread executor so generation jobs are serialised
_generation_executor = ThreadPoolExecutor(max_workers=1)


def _run_generation_sync(project_id: str, question_ids: list):
    """Blocking generation — must be called via run_in_threadpool or a thread."""
    db = SessionLocal()
    try:
        from src.services.answer_generation_service import get_answer_generation_service
        service = get_answer_generation_service(db)
        service.generate_all_answers(project_id, question_ids or None)
    except Exception as e:
        print(f"Generation failed for project {project_id}: {e}")
    finally:
        db.close()


@router.post("/", response_model=Project)
async def create_project(
    project_data: ProjectCreate,
    db: Session = Depends(get_db)
):
    """Create a new project"""
    try:
        service = ProjectService(db)
        return service.create_project(project_data)
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=List[Project])
async def get_projects(
    skip: int = 0,
    limit: int = 100,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all projects with optional filtering"""
    try:
        service = ProjectService(db)
        projects = service.get_projects(skip, limit)
        
        # Filter by status if provided
        if status:
            projects = [p for p in projects if p.status == status]
        
        return projects
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}", response_model=Project)
async def get_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get project by ID"""
    try:
        service = ProjectService(db)
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{project_id}", response_model=Project)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    db: Session = Depends(get_db)
):
    """Update project"""
    try:
        service = ProjectService(db)
        project = service.update_project(project_id, project_data)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        return project
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Delete project"""
    try:
        service = ProjectService(db)
        success = service.delete_project(project_id)
        if success:
            return {"success": True, "message": "Project deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="Project not found")
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{project_id}/details", response_model=ProjectResponse)
async def get_project_details(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get project with questions and answers"""
    try:
        service = ProjectService(db)
        details = service.get_project_with_details(project_id)
        if not details:
            raise HTTPException(status_code=404, detail="Project not found")
        return details
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{project_id}/generate-answers")
async def generate_project_answers(
    project_id: str,
    background_tasks: BackgroundTasks,
    question_ids: Optional[List[str]] = None,
    async_processing: bool = True,
    db: Session = Depends(get_db)
):
    """Start answer generation. Runs in a thread so the event loop stays free for SSE streaming."""
    service = ProjectService(db)
    project = service.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if async_processing:
        # Run blocking generation in a thread pool so the event loop is free
        # to serve the SSE stream concurrently
        asyncio.get_event_loop().run_in_executor(
            _generation_executor, _run_generation_sync, project_id, question_ids or []
        )
        return {
            "success": True,
            "message": "Answer generation started in background",
            "project_id": project_id,
        }
    else:
        result = await run_in_threadpool(_run_generation_sync, project_id, question_ids or [])
        return {"success": True, "project_id": project_id}


@router.get("/{project_id}/generate-answers/stream")
async def stream_generation_progress(project_id: str):
    """SSE stream emitting answer counts every 2s until generation completes."""
    async def event_generator():
        for _ in range(150):  # max 5 minutes
            tick_db = SessionLocal()
            try:
                project = ProjectService(tick_db).get_project(project_id)
                if not project:
                    yield f"data: {json.dumps({'error': 'Project not found'})}\n\n"
                    return
                total = tick_db.query(Question).filter(
                    Question.questionnaire_id == project.questionnaire_id
                ).count() if project.questionnaire_id else 0
                answered = tick_db.query(Answer).filter(
                    Answer.project_id == project.id
                ).count()
                payload = {
                    "project_id": project_id,
                    "status": project.status,
                    "total": total,
                    "answered": answered,
                    "done": project.status in ("COMPLETED", "ERROR"),
                }
                yield f"data: {json.dumps(payload)}\n\n"
                if payload["done"]:
                    return
            finally:
                tick_db.close()
            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/{project_id}/answers/statistics")
async def get_project_answer_statistics(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get answer statistics for project"""
    try:
        answer_service = get_answer_generation_service(db)
        stats = answer_service.get_answer_statistics(project_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{project_id}/questionnaire")
async def set_project_questionnaire(
    project_id: str,
    questionnaire_id: str,
    db: Session = Depends(get_db)
):
    """Set questionnaire for project"""
    try:
        service = ProjectService(db)
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Check if questionnaire exists
        questionnaire = db.query(Questionnaire).filter(
            Questionnaire.id == questionnaire_id
        ).first()
        if not questionnaire:
            raise HTTPException(status_code=404, detail="Questionnaire not found")
        
        # Update project
        project.questionnaire_id = questionnaire_id
        db.commit()
        
        return {
            "success": True,
            "message": "Questionnaire set for project",
            "project_id": project_id,
            "questionnaire_id": questionnaire_id,
            "questionnaire_name": questionnaire.name
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{project_id}/questionnaire")
async def get_project_questionnaire(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get project questionnaire with questions"""
    try:
        service = ProjectService(db)
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        if not project.questionnaire_id:
            return {"message": "No questionnaire set for project"}
        
        questionnaire = db.query(Questionnaire).filter(
            Questionnaire.id == project.questionnaire_id
        ).first()
        
        if not questionnaire:
            raise HTTPException(status_code=404, detail="Questionnaire not found")
        
        # Get questions
        questions = db.query(Question).filter(
            Question.questionnaire_id == questionnaire.id
        ).order_by(Question.order).all()
        
        return {
            "questionnaire": {
                "id": str(questionnaire.id),
                "name": questionnaire.name,
                "description": questionnaire.description,
                "file_path": questionnaire.file_path,
                "created_at": questionnaire.created_at
            },
            "questions": [
                {
                    "id": str(q.id),
                    "text": q.text,
                    "question_type": q.question_type,
                    "section": q.section,
                    "order": q.order,
                    "options": q.options
                }
                for q in questions
            ],
            "total_questions": len(questions)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{project_id}/mark-outdated")
async def mark_project_outdated(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Mark project as outdated (when new documents are added)"""
    try:
        service = ProjectService(db)
        success = service.mark_project_outdated(project_id)
        
        if success:
            return {"success": True, "message": "Project marked as outdated"}
        else:
            raise HTTPException(status_code=404, detail="Project not found")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/{project_id}/status")
async def get_project_status(
    project_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed project status"""
    try:
        service = ProjectService(db)
        project = service.get_project(project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        
        # Get answer statistics
        answer_service = get_answer_generation_service(db)
        answer_stats = answer_service.get_answer_statistics(project_id)
        
        # Get questionnaire info
        questionnaire_info = None
        if project.questionnaire_id:
            questionnaire = db.query(Questionnaire).filter(
                Questionnaire.id == project.questionnaire_id
            ).first()
            if questionnaire:
                question_count = db.query(Question).filter(
                    Question.questionnaire_id == questionnaire.id
                ).count()
                questionnaire_info = {
                    "id": str(questionnaire.id),
                    "name": questionnaire.name,
                    "question_count": question_count
                }
        
        return {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "status": project.status,
                "created_at": project.created_at,
                "updated_at": project.updated_at
            },
            "questionnaire": questionnaire_info,
            "answer_statistics": answer_stats,
            "overall_progress": {
                "total_questions": answer_stats.get("total", 0),
                "completed_answers": answer_stats.get("COMPLETED", 0),
                "pending_answers": answer_stats.get("PENDING", 0),
                "completion_rate": (
                    answer_stats.get("COMPLETED", 0) / answer_stats.get("total", 1) * 100
                )
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
