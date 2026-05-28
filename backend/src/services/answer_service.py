from typing import List, Optional, Dict, Any, Union
from uuid import UUID
from sqlalchemy.orm import Session
from src.utils.uuid_utils import as_uuid
from src.models.db_models import Answer, Question, Project
from src.models.schemas import AnswerCreate, AnswerUpdate
from src.models.enums import AnswerStatus


class AnswerService:
    """Service for managing answers"""

    def __init__(self, db: Session):
        self.db = db

    def create_answer(self, answer_data: AnswerCreate, project_id: UUID) -> Answer:
        """Create a new answer"""
        answer = Answer(**answer_data.model_dump(), project_id=project_id)
        self.db.add(answer)
        self.db.commit()
        self.db.refresh(answer)
        return answer

    def get_answer(self, answer_id: Union[str, UUID]) -> Optional[Answer]:
        """Get answer by ID"""
        return self.db.query(Answer).filter(Answer.id == as_uuid(answer_id)).first()

    def get_answers_by_project(self, project_id: Union[str, UUID]) -> List[Answer]:
        """Get all answers for a project"""
        return (
            self.db.query(Answer).filter(Answer.project_id == as_uuid(project_id)).all()
        )

    def get_answer_by_question(
        self, project_id: Union[str, UUID], question_id: Union[str, UUID]
    ) -> Optional[Answer]:
        """Get answer for specific question in project"""
        return (
            self.db.query(Answer)
            .filter(
                Answer.project_id == as_uuid(project_id),
                Answer.question_id == as_uuid(question_id),
            )
            .first()
        )

    def update_answer(
        self, answer_id: Union[str, UUID], answer_data: AnswerUpdate
    ) -> Optional[Answer]:
        """Update answer"""
        answer = self.get_answer(answer_id)
        if not answer:
            return None

        update_data = answer_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(answer, field, value)

        self.db.commit()
        self.db.refresh(answer)
        return answer

    def update_answer_status(
        self, answer_id: Union[str, UUID], status: AnswerStatus
    ) -> bool:
        """Update answer status"""
        answer = self.get_answer(answer_id)
        if not answer:
            return False

        answer.status = status
        self.db.commit()
        return True

    def set_manual_answer(
        self, answer_id: Union[str, UUID], manual_answer: str
    ) -> bool:
        """Set manual answer and update status"""
        answer = self.get_answer(answer_id)
        if not answer:
            return False

        answer.manual_answer = manual_answer
        answer.status = AnswerStatus.MANUAL_UPDATED
        self.db.commit()
        return True

    def get_answers_for_review(self, project_id: Union[str, UUID]) -> List[Answer]:
        """Get answers that need review"""
        return (
            self.db.query(Answer)
            .filter(
                Answer.project_id == as_uuid(project_id),
                Answer.status.in_([AnswerStatus.PENDING, AnswerStatus.REJECTED]),
            )
            .all()
        )

    def bulk_update_status(self, answer_ids: List[UUID], status: AnswerStatus) -> int:
        """Bulk update answer status"""
        updated = (
            self.db.query(Answer)
            .filter(Answer.id.in_(answer_ids))
            .update({"status": status}, synchronize_session=False)
        )
        self.db.commit()
        return updated

    def get_answer_statistics(self, project_id: Union[str, UUID]) -> Dict[str, int]:
        """Get answer statistics for project"""
        from sqlalchemy import func

        stats = (
            self.db.query(Answer.status, func.count(Answer.id).label("count"))
            .filter(Answer.project_id == as_uuid(project_id))
            .group_by(Answer.status)
            .all()
        )

        return {status: count for status, count in stats}
