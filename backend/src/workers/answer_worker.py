from celery import Celery
from sqlalchemy.orm import Session
from src.config import settings
from src.storage.database import SessionLocal
from src.services.answer_generation_service import get_answer_generation_service
from src.services.evaluation_service import get_evaluation_service
from src.models.db_models import Request
from src.models.enums import RequestStatus
import time

# Initialize Celery
celery_app = Celery(
    "answer_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)


@celery_app.task(bind=True)
def generate_single_answer_task(self, project_id: str, question_id: str):
    """Background task for generating single answer"""
    db = SessionLocal()
    try:
        # Create request record
        request = Request(
            request_type="GENERATE_SINGLE_ANSWER",
            project_id=project_id,
            status=RequestStatus.PENDING
        )
        db.add(request)
        db.flush()
        
        # Update status to running
        request.status = RequestStatus.RUNNING
        request.progress = 0.1
        db.commit()
        
        # Generate answer
        answer_service = get_answer_generation_service(db)
        result = answer_service.generate_single_answer(project_id, question_id)
        
        # Complete request
        request.status = RequestStatus.COMPLETED
        request.progress = 1.0
        request.result_data = result
        db.commit()
        
        return result
        
    except Exception as e:
        # Update request status to failure
        if 'request' in locals():
            request.status = RequestStatus.FAILED
            request.error_message = str(e)
            db.commit()
        
        # Update task status
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def generate_all_answers_task(self, project_id: str, question_ids: list = None):
    """Background task for generating all answers"""
    db = SessionLocal()
    try:
        # Create request record
        request = Request(
            request_type="GENERATE_ALL_ANSWERS",
            project_id=project_id,
            status=RequestStatus.PENDING
        )
        db.add(request)
        db.flush()
        
        # Update status to running
        request.status = RequestStatus.RUNNING
        request.progress = 0.1
        db.commit()
        
        # Generate answers
        answer_service = get_answer_generation_service(db)
        result = answer_service.generate_all_answers(project_id, question_ids)
        
        # Complete request
        request.status = RequestStatus.COMPLETED
        request.progress = 1.0
        request.result_data = result
        db.commit()
        
        return result
        
    except Exception as e:
        # Update request status to failure
        if 'request' in locals():
            request.status = RequestStatus.FAILED
            request.error_message = str(e)
            db.commit()
        
        # Update task status
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def evaluate_answers_task(self, project_id: str, ground_truth_answers: dict):
    """Background task for evaluating answers"""
    db = SessionLocal()
    try:
        # Create request record
        request = Request(
            request_type="EVALUATE_ANSWERS",
            project_id=project_id,
            status=RequestStatus.PENDING
        )
        db.add(request)
        db.flush()
        
        # Update status to running
        request.status = RequestStatus.RUNNING
        request.progress = 0.1
        db.commit()
        
        # Evaluate answers
        evaluation_service = get_evaluation_service(db)
        result = evaluation_service.evaluate_project_answers(project_id, ground_truth_answers)
        
        # Complete request
        request.status = RequestStatus.COMPLETED
        request.progress = 1.0
        request.result_data = result
        db.commit()
        
        return result
        
    except Exception as e:
        # Update request status to failure
        if 'request' in locals():
            request.status = RequestStatus.FAILED
            request.error_message = str(e)
            db.commit()
        
        # Update task status
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()


@celery_app.task(bind=True)
def batch_process_projects_task(self, project_ids: list, operation: str):
    """Background task for batch processing projects"""
    db = SessionLocal()
    try:
        # Create request record
        request = Request(
            request_type=f"BATCH_{operation.upper()}",
            status=RequestStatus.PENDING
        )
        db.add(request)
        db.flush()
        
        # Update status to running
        request.status = RequestStatus.RUNNING
        request.progress = 0.0
        db.commit()
        
        results = []
        total_projects = len(project_ids)
        
        for i, project_id in enumerate(project_ids):
            try:
                if operation == "generate_answers":
                    answer_service = get_answer_generation_service(db)
                    result = answer_service.generate_all_answers(project_id)
                    results.append({
                        "project_id": project_id,
                        "success": True,
                        "result": result
                    })
                elif operation == "evaluate":
                    # This would need ground truth answers - placeholder
                    results.append({
                        "project_id": project_id,
                        "success": False,
                        "error": "Evaluation requires ground truth answers"
                    })
                
                # Update progress
                progress = (i + 1) / total_projects
                request.progress = progress
                db.commit()
                
            except Exception as e:
                results.append({
                    "project_id": project_id,
                    "success": False,
                    "error": str(e)
                })
        
        # Complete request
        request.status = RequestStatus.COMPLETED
        request.progress = 1.0
        request.result_data = {
            "total_projects": total_projects,
            "results": results
        }
        db.commit()
        
        return {
            "total_projects": total_projects,
            "results": results
        }
        
    except Exception as e:
        # Update request status to failure
        if 'request' in locals():
            request.status = RequestStatus.FAILED
            request.error_message = str(e)
            db.commit()
        
        # Update task status
        self.update_state(
            state="FAILURE",
            meta={"error": str(e)}
        )
        raise
    finally:
        db.close()
