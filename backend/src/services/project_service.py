from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from src.models.db_models import Project, Questionnaire, Question, Answer
from src.models.schemas import ProjectCreate, ProjectUpdate
from src.models.enums import ProjectStatus


class ProjectService:
    """Service for managing projects"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_project(self, project_data: ProjectCreate) -> Project:
        """Create a new project"""
        project = Project(**project_data.dict())
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project
    
    def get_project(self, project_id: UUID) -> Optional[Project]:
        """Get project by ID"""
        return self.db.query(Project).filter(Project.id == project_id).first()
    
    def get_projects(self, skip: int = 0, limit: int = 100) -> List[Project]:
        """Get all projects with pagination"""
        return self.db.query(Project).offset(skip).limit(limit).all()
    
    def update_project(self, project_id: UUID, project_data: ProjectUpdate) -> Optional[Project]:
        """Update project"""
        project = self.get_project(project_id)
        if not project:
            return None
        
        update_data = project_data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(project, field, value)
        
        self.db.commit()
        self.db.refresh(project)
        return project
    
    def delete_project(self, project_id: UUID) -> bool:
        """Delete project"""
        project = self.get_project(project_id)
        if not project:
            return False
        
        self.db.delete(project)
        self.db.commit()
        return True
    
    def get_project_with_details(self, project_id: UUID) -> Optional[dict]:
        """Get project with questions and answers"""
        project = self.get_project(project_id)
        if not project:
            return None
        
        # Get questions from questionnaire
        questions = []
        if project.questionnaire:
            questions = self.db.query(Question).filter(
                Question.questionnaire_id == project.questionnaire_id
            ).order_by(Question.order).all()
        
        # Get answers
        answers = self.db.query(Answer).filter(
            Answer.project_id == project_id
        ).all()
        
        return {
            "project": project,
            "questions": questions,
            "answers": answers
        }
    
    def mark_project_outdated(self, project_id: UUID) -> bool:
        """Mark project as outdated when new documents are added"""
        project = self.get_project(project_id)
        if not project:
            return False
        
        project.status = ProjectStatus.OUTDATED
        self.db.commit()
        return True
