from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
from src.storage.database import get_db
from src.services.answer_generation_service import get_answer_generation_service
from src.services.evaluation_service import get_evaluation_service
from src.models.schemas import (
    Answer as AnswerSchema,
    AnswerUpdate,
    GenerationRequest,
    EvaluationRequest,
    EvaluationResponse,
    ProjectResponse,
)
from src.models.db_models import Answer as AnswerModel
from src.utils.exceptions import GenerationError, DueDiligenceException
from src.services.llm_service import (
    LLMAuthError,
    LLMRateLimitError,
    LLMContextTooLongError,
    LLMModelError,
)
from src.workers.answer_worker import (
    generate_single_answer_task,
    generate_all_answers_task,
)

router = APIRouter(prefix="/api/v1/answers", tags=["answers"])


def _llm_http_exception(e: GenerationError) -> HTTPException:
    """Map LLM-specific errors to appropriate HTTP status codes."""
    if isinstance(e, LLMAuthError):
        return HTTPException(status_code=401, detail=str(e))
    if isinstance(e, LLMRateLimitError):
        return HTTPException(status_code=429, detail=str(e))
    if isinstance(e, LLMContextTooLongError):
        return HTTPException(status_code=422, detail=str(e))
    if isinstance(e, LLMModelError):
        return HTTPException(status_code=400, detail=str(e))
    return HTTPException(status_code=500, detail=str(e))


@router.post("/generate-single", response_model=Dict[str, Any])
async def generate_single_answer(
    request: GenerationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate answer for a single question"""
    try:
        answer_service = get_answer_generation_service(db)

        if request.question_ids:
            # Use first question ID for single answer generation
            question_id = request.question_ids[0]
        else:
            raise HTTPException(status_code=400, detail="question_ids is required")

        # Generate answer
        result = answer_service.generate_single_answer(request.project_id, question_id)

        return {
            "success": True,
            "result": result,
            "message": "Answer generated successfully",
        }

    except GenerationError as e:
        raise _llm_http_exception(e)
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/generate-single-async")
async def generate_single_answer_async(
    request: GenerationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate answer for a single question asynchronously"""
    try:
        if not request.question_ids:
            raise HTTPException(status_code=400, detail="question_ids is required")

        question_id = request.question_ids[0]

        # Queue background task
        try:
            task = generate_single_answer_task.delay(request.project_id, question_id)
        except Exception as broker_err:
            raise HTTPException(
                status_code=503,
                detail=f"Background task broker unavailable: {str(broker_err)}",
            )

        return {
            "success": True,
            "task_id": task.id,
            "message": "Answer generation started in background",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to start background task: {str(e)}"
        )


@router.post("/generate-all", response_model=Dict[str, Any])
async def generate_all_answers(
    request: GenerationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate answers for all questions in a project"""
    try:
        answer_service = get_answer_generation_service(db)

        result = answer_service.generate_all_answers(
            request.project_id, request.question_ids
        )

        return result

    except GenerationError as e:
        raise _llm_http_exception(e)
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/generate-all-async")
async def generate_all_answers_async(
    request: GenerationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Generate answers for all questions in a project asynchronously"""
    try:
        # Queue background task
        try:
            task = generate_all_answers_task.delay(
                request.project_id, request.question_ids or []
            )
        except Exception as broker_err:
            raise HTTPException(
                status_code=503,
                detail=f"Background task broker unavailable: {str(broker_err)}",
            )

        return {
            "success": True,
            "task_id": task.id,
            "message": "Bulk answer generation started in background",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to start background task: {str(e)}"
        )


@router.get("/{answer_id}", response_model=AnswerSchema)
async def get_answer(answer_id: str, db: Session = Depends(get_db)):
    """Get answer by ID"""
    try:
        answer_service = get_answer_generation_service(db)
        answer = answer_service.get_answer(answer_id)
        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        answer_with_context = answer_service.get_answer_with_context(
            str(answer.project_id),
            str(answer.question_id),
        )

        if "error" in answer_with_context:
            raise HTTPException(status_code=404, detail="Answer not found")

        return answer_with_context["answer"]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.put("/{answer_id}", response_model=AnswerSchema)
async def update_answer(
    answer_id: str, answer_update: AnswerUpdate, db: Session = Depends(get_db)
):
    """Update answer (manual override)"""
    try:
        answer_service = get_answer_generation_service(db)

        # Get answer to find project and question IDs
        answer = db.query(AnswerModel).filter(AnswerModel.id == answer_id).first()
        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        # Handle manual answer update
        if answer_update.manual_answer is not None:
            result = answer_service.update_manual_answer(
                str(answer.project_id),
                str(answer.question_id),
                answer_update.manual_answer,
            )
            return result

        # Handle other updates
        updated_answer = answer_service.update_answer(answer_id, answer_update)
        if not updated_answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        return updated_answer

    except HTTPException:
        raise
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{answer_id}/confirm")
async def confirm_answer(answer_id: str, db: Session = Depends(get_db)):
    """Confirm an answer"""
    try:
        answer_service = get_answer_generation_service(db)

        # Get answer to find project and question IDs
        answer = db.query(AnswerModel).filter(AnswerModel.id == answer_id).first()
        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        success = answer_service.confirm_answer(
            str(answer.project_id), str(answer.question_id)
        )

        if success:
            return {"success": True, "message": "Answer confirmed successfully"}
        else:
            raise HTTPException(status_code=400, detail="Failed to confirm answer")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{answer_id}/reject")
async def reject_answer(
    answer_id: str, reason: Optional[str] = None, db: Session = Depends(get_db)
):
    """Reject an answer"""
    try:
        answer_service = get_answer_generation_service(db)

        # Get answer to find project and question IDs
        answer = db.query(AnswerModel).filter(AnswerModel.id == answer_id).first()
        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        success = answer_service.reject_answer(
            str(answer.project_id), str(answer.question_id), reason
        )

        if success:
            return {"success": True, "message": "Answer rejected successfully"}
        else:
            raise HTTPException(status_code=400, detail="Failed to reject answer")

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/{answer_id}/regenerate")
async def regenerate_answer(answer_id: str, db: Session = Depends(get_db)):
    """Regenerate an answer"""
    try:
        answer_service = get_answer_generation_service(db)

        # Get answer to find project and question IDs
        answer = db.query(AnswerModel).filter(AnswerModel.id == answer_id).first()
        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        result = answer_service.regenerate_answer(
            str(answer.project_id), str(answer.question_id)
        )

        return {
            "success": True,
            "result": result,
            "message": "Answer regenerated successfully",
        }

    except HTTPException:
        raise
    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/project/{project_id}", response_model=List[AnswerSchema])
async def get_project_answers(project_id: str, db: Session = Depends(get_db)):
    """Get all answers for a project"""
    try:
        answer_service = get_answer_generation_service(db)
        answers = answer_service.get_answers_by_project(project_id)
        return answers

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/project/{project_id}/with-context", response_model=Dict[str, Any])
async def get_project_answers_with_context(
    project_id: str, db: Session = Depends(get_db)
):
    """Get all answers for a project with full context and citations"""
    try:
        answer_service = get_answer_generation_service(db)
        answers = answer_service.get_answers_by_project(project_id)

        answers_with_context = []
        for answer in answers:
            context_data = answer_service.get_answer_with_context(
                project_id, str(answer.question_id)
            )
            answers_with_context.append(context_data)

        return {
            "project_id": project_id,
            "answers": answers_with_context,
            "total_answers": len(answers_with_context),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/evaluate", response_model=EvaluationResponse)
async def evaluate_answers(request: EvaluationRequest, db: Session = Depends(get_db)):
    """Evaluate answers against ground truth"""
    try:
        evaluation_service = get_evaluation_service(db)
        result = evaluation_service.evaluate_project_answers(
            request.project_id, request.ground_truth_answers
        )

        # Map to Pydantic schema fields if not already present
        if "question_evaluations" in result and result["question_evaluations"]:
            q_evals = result["question_evaluations"]

            # Map question_scores
            if not result.get("question_scores"):
                result["question_scores"] = {
                    str(ev.get("question_id")): ev.get("similarity_scores", {}).get(
                        "combined", 0.0
                    )
                    for ev in q_evals
                    if ev.get("question_id")
                }

            # Map detailed_comparison
            if not result.get("detailed_comparison"):
                result["detailed_comparison"] = [
                    {
                        "question_id": str(ev.get("question_id")),
                        "similarity_score": ev.get("similarity_scores", {}).get(
                            "combined", 0.0
                        ),
                        "ai_answer": ev.get("ai_answer"),
                        "ground_truth": ev.get("ground_truth"),
                        "status": ev.get("status"),
                    }
                    for ev in q_evals
                    if ev.get("question_id")
                ]

        return result

    except DueDiligenceException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/project/{project_id}/compare-ai-manual")
async def compare_ai_vs_manual_answers(project_id: str, db: Session = Depends(get_db)):
    """Compare AI-generated answers with manual answers"""
    try:
        evaluation_service = get_evaluation_service(db)
        result = evaluation_service.compare_ai_vs_manual_answers(project_id)
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/project/{project_id}/statistics")
async def get_answer_statistics(project_id: str, db: Session = Depends(get_db)):
    """Get answer statistics for a project"""
    try:
        answer_service = get_answer_generation_service(db)
        stats = answer_service.get_answer_statistics(project_id)
        return stats

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get(
    "/question/{question_id}/project/{project_id}", response_model=Dict[str, Any]
)
async def get_question_answer(
    question_id: str, project_id: str, db: Session = Depends(get_db)
):
    """Get answer for a specific question in a project"""
    try:
        answer_service = get_answer_generation_service(db)
        answer = answer_service.get_answer_by_question(project_id, question_id)

        if not answer:
            raise HTTPException(status_code=404, detail="Answer not found")

        # Get full context
        context_data = answer_service.get_answer_with_context(
            project_id, str(answer.question_id)
        )
        return context_data

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
