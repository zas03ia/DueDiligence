import uuid
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from src.models.db_models import Project, Question, Answer, Document, Request
from src.models.enums import AnswerStatus, QuestionType, ProjectStatus, RequestStatus
from src.services.llm_service import llm_service
from src.indexing.vector_index import vector_index_manager
from src.indexing.indexing_pipeline import IndexingPipeline
from src.utils.exceptions import GenerationError
from src.utils.uuid_utils import as_uuid
from src.services.answer_service import AnswerService
from src.models.schemas import AnswerUpdate
import time


class AnswerGenerationService:
    """Service for generating answers with citations and confidence scores"""

    def __init__(self, db: Session):
        self.db = db
        self.indexing_pipeline = IndexingPipeline(db)
        self._answer_service = AnswerService(db)

    def get_answer(self, answer_id: str):
        return self._answer_service.get_answer(answer_id)

    def get_answers_by_project(self, project_id: str):
        return self._answer_service.get_answers_by_project(project_id)

    def get_answer_by_question(self, project_id: str, question_id: str):
        return self._answer_service.get_answer_by_question(project_id, question_id)

    def update_answer(self, answer_id: str, answer_data: AnswerUpdate):
        return self._answer_service.update_answer(answer_id, answer_data)

    def get_answer_statistics(self, project_id: str):
        stats = self._answer_service.get_answer_statistics(project_id)
        stats["total"] = sum(stats.values())
        return stats

    def generate_single_answer(
        self, project_id: str, question_id: str, use_cached: bool = True
    ) -> Dict[str, Any]:
        """Generate answer for a single question"""
        try:
            project_uuid = as_uuid(project_id)
            question_uuid = as_uuid(question_id)

            project = self.db.query(Project).filter(Project.id == project_uuid).first()
            question = (
                self.db.query(Question).filter(Question.id == question_uuid).first()
            )

            if not project or not question:
                raise GenerationError("Project or question not found")

            existing_answer = (
                self.db.query(Answer)
                .filter(
                    Answer.project_id == project_uuid,
                    Answer.question_id == question_uuid,
                )
                .first()
            )

            if existing_answer and use_cached:
                return self._format_answer_response(existing_answer)

            # Get relevant documents for the project
            document_ids = self._get_project_document_ids(project)
            if not document_ids:
                return self._create_no_context_answer(project_id, question_id, question)

            # Search for relevant chunks
            relevant_chunks = vector_index_manager.search_across_documents(
                document_ids=document_ids, query_text=question.text, top_k=5
            )

            if not relevant_chunks:
                return self._create_no_context_answer(project_id, question_id, question)

            # Generate answer with citations
            llm_response = llm_service.generate_single_answer_with_citations(
                question=question.text, relevant_chunks=relevant_chunks
            )

            # Evaluate answer quality
            evaluation = llm_service.evaluate_answer_quality(
                question=question.text, answer=llm_response["answer_text"]
            )

            # Create or update answer record
            answer_data = {
                "answer_text": llm_response["answer_text"],
                "confidence_score": evaluation.get(
                    "confidence_score", llm_response.get("confidence_score", 0.5)
                ),
                "is_answerable": evaluation.get(
                    "is_answerable", llm_response.get("is_answerable", True)
                ),
                "citations": llm_response.get("citations", []),
                "status": AnswerStatus.PENDING,
            }

            if existing_answer:
                for key, value in answer_data.items():
                    setattr(existing_answer, key, value)
                answer = existing_answer
            else:
                answer = Answer(
                    project_id=project_uuid, question_id=question_uuid, **answer_data
                )
                self.db.add(answer)

            self.db.commit()
            self.db.refresh(answer)

            return self._format_answer_response(answer, llm_response, evaluation)

        except GenerationError:
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            raise GenerationError(
                f"Failed to generate answer: {type(e).__name__}: {str(e)}"
            )

    def generate_all_answers(
        self, project_id: str, question_ids: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Generate answers for all questions in a project"""
        project_uuid = as_uuid(project_id)
        project = self.db.query(Project).filter(Project.id == project_uuid).first()
        if not project:
            raise GenerationError("Project not found")

        # Set project status to GENERATING and create a Request record so progress and errors are queryable
        project.status = ProjectStatus.GENERATING
        gen_request = Request(
            request_type="GENERATE_ANSWERS",
            project_id=project_uuid,
            status=RequestStatus.RUNNING,
            progress=0.0,
        )
        self.db.add(gen_request)
        self.db.commit()
        self.db.refresh(gen_request)

        try:
            if question_ids:
                question_uuids = [as_uuid(qid) for qid in question_ids]
                questions = (
                    self.db.query(Question)
                    .filter(
                        Question.id.in_(question_uuids),
                        Question.questionnaire_id == project.questionnaire_id,
                    )
                    .all()
                )
            else:
                questions = (
                    self.db.query(Question)
                    .filter(Question.questionnaire_id == project.questionnaire_id)
                    .all()
                )

            if not questions:
                gen_request.status = RequestStatus.FAILED
                gen_request.error_message = (
                    "No questions found. Make sure a questionnaire is assigned to this project "
                    "and that it contains questions."
                )
                project.status = ProjectStatus.ERROR
                self.db.commit()
                return {
                    "success": False,
                    "request_id": str(gen_request.id),
                    "message": gen_request.error_message,
                }

            document_ids = self._get_project_document_ids(project)
            if not document_ids:
                gen_request.status = RequestStatus.COMPLETED
                gen_request.error_message = "No indexed documents found in project scope — answers marked as missing data."
                project.status = ProjectStatus.COMPLETED
                self.db.commit()
                return self._create_no_context_project_answers(project_id, questions)

            results = []
            successful = 0
            failed = 0
            failed_details = []
            missing_data_count = 0

            for i, question in enumerate(questions):
                try:
                    answer_result = self.generate_single_answer(
                        project_id, str(question.id), use_cached=False
                    )
                    answer_result["question_text"] = question.text
                    answer_result["question_type"] = question.question_type
                    results.append(answer_result)
                    if answer_result.get("status") == AnswerStatus.MISSING_DATA:
                        missing_data_count += 1
                    successful += 1
                except Exception as e:
                    error_type = type(e).__name__
                    error_msg = str(e)
                    results.append(
                        {
                            "question_id": str(question.id),
                            "question_text": question.text[:120],
                            "success": False,
                            "error_type": error_type,
                            "error": error_msg,
                        }
                    )
                    failed_details.append(f"Q{i+1} [{error_type}]: {error_msg[:200]}")
                    failed += 1

                # Persist progress so the SSE stream can show it
                gen_request.progress = round((i + 1) / len(questions), 2)
                self.db.commit()

            # Build a human-readable summary
            if failed_details:
                gen_request.error_message = (
                    f"{failed}/{len(questions)} questions failed. "
                    + " | ".join(failed_details[:5])
                    + (" ..." if len(failed_details) > 5 else "")
                )
            elif missing_data_count == len(questions):
                gen_request.error_message = (
                    "All answers created but no indexed documents provided context. "
                    "Upload documents, ensure they are indexed, and make sure they are in the project's document scope."
                )
            elif missing_data_count > 0:
                gen_request.error_message = (
                    f"{missing_data_count}/{len(questions)} answers have no document context. "
                    "Check that your documents are indexed and relevant to the questions."
                )

            project.status = (
                ProjectStatus.COMPLETED
                if successful > 0 and missing_data_count < len(questions)
                else ProjectStatus.ERROR
            )
            gen_request.status = (
                RequestStatus.COMPLETED
                if successful > 0 and missing_data_count < len(questions)
                else RequestStatus.FAILED
            )
            gen_request.result_data = {
                "total": len(questions),
                "successful": successful,
                "failed": failed,
                "missing_data": missing_data_count,
            }
            self.db.commit()

            return {
                "success": True,
                "request_id": str(gen_request.id),
                "project_id": project_id,
                "total_questions": len(questions),
                "successful": successful,
                "failed": failed,
                "results": results,
            }
        except GenerationError:
            gen_request.status = RequestStatus.FAILED
            gen_request.error_message = "Generation aborted — see details above."
            project.status = ProjectStatus.ERROR
            self.db.commit()
            raise
        except Exception as e:
            self.db.rollback()
            gen_request.status = RequestStatus.FAILED
            gen_request.error_message = f"{type(e).__name__}: {str(e)}"
            project.status = ProjectStatus.ERROR
            try:
                self.db.commit()
            except Exception:
                pass
            raise GenerationError(f"{type(e).__name__}: {str(e)}")

    def regenerate_answer(self, project_id: str, question_id: str) -> Dict[str, Any]:
        """Regenerate answer for a specific question"""
        return self.generate_single_answer(project_id, question_id, use_cached=False)

    def update_manual_answer(
        self, project_id: str, question_id: str, manual_answer: str
    ) -> Dict[str, Any]:
        """Update answer with manual input"""
        try:
            answer = (
                self.db.query(Answer)
                .filter(
                    Answer.project_id == as_uuid(project_id),
                    Answer.question_id == as_uuid(question_id),
                )
                .first()
            )
            if not answer:
                answer = Answer(
                    project_id=as_uuid(project_id),
                    question_id=as_uuid(question_id),
                    manual_answer=manual_answer,
                    status=AnswerStatus.MANUAL_UPDATED,
                    confidence_score=1.0,
                    is_answerable=True,
                    answer_text=manual_answer,
                )
                self.db.add(answer)
            else:
                answer.manual_answer = manual_answer
                answer.status = AnswerStatus.MANUAL_UPDATED
                answer.confidence_score = 1.0
                answer.is_answerable = True
            self.db.commit()
            self.db.refresh(answer)
            return self._format_answer_response(answer)
        except Exception as e:
            self.db.rollback()
            raise GenerationError(f"Failed to update manual answer: {str(e)}")

    def confirm_answer(self, project_id: str, question_id: str) -> bool:
        """Confirm an answer"""
        try:
            answer = (
                self.db.query(Answer)
                .filter(
                    Answer.project_id == as_uuid(project_id),
                    Answer.question_id == as_uuid(question_id),
                )
                .first()
            )
            if answer:
                answer.status = AnswerStatus.CONFIRMED
                self.db.commit()
                return True
            return False
        except Exception as e:
            self.db.rollback()
            raise GenerationError(f"Failed to confirm answer: {str(e)}")

    def reject_answer(
        self, project_id: str, question_id: str, reason: Optional[str] = None
    ) -> bool:
        """Reject an answer"""
        try:
            answer = (
                self.db.query(Answer)
                .filter(
                    Answer.project_id == as_uuid(project_id),
                    Answer.question_id == as_uuid(question_id),
                )
                .first()
            )
            if answer:
                answer.status = AnswerStatus.REJECTED
                if reason:
                    answer.rejection_reason = reason
                self.db.commit()
                return True
            return False
        except Exception as e:
            self.db.rollback()
            raise GenerationError(f"Failed to reject answer: {str(e)}")

    def get_answer_with_context(
        self, project_id: str, question_id: str
    ) -> Dict[str, Any]:
        """Get answer with full context and citations"""
        try:
            answer = (
                self.db.query(Answer)
                .filter(
                    Answer.project_id == as_uuid(project_id),
                    Answer.question_id == as_uuid(question_id),
                )
                .first()
            )
            if not answer:
                return {"error": "Answer not found"}

            # Get question details
            question = (
                self.db.query(Question)
                .filter(Question.id == as_uuid(question_id))
                .first()
            )

            # Get citation contexts
            citation_contexts = []
            if answer.citations:
                for citation in answer.citations:
                    if isinstance(citation, dict) and "chunk_id" in citation:
                        # Get document ID from answer or project
                        document_ids = self._get_project_document_ids(answer.project)
                        if document_ids:
                            context = vector_index_manager.get_citation_context(
                                document_ids[0], citation["chunk_id"]
                            )
                            citation_contexts.append(context)

            return {
                "answer": self._format_answer_response(answer),
                "question": (
                    {
                        "id": str(question.id),
                        "text": question.text,
                        "type": question.question_type,
                        "section": question.section,
                    }
                    if question
                    else None
                ),
                "citation_contexts": citation_contexts,
            }

        except Exception as e:
            raise GenerationError(f"Failed to get answer with context: {str(e)}")

    def _get_project_document_ids(self, project: Project) -> List[str]:
        """Get document IDs for a project, honouring document_scope when set."""
        scope = project.document_scope or []
        if scope:
            from src.utils.uuid_utils import as_uuid as _as_uuid

            scope_uuids = [_as_uuid(doc_id) for doc_id in scope]
            documents = (
                self.db.query(Document)
                .filter(Document.id.in_(scope_uuids), Document.indexed == True)
                .all()
            )
        else:
            documents = self.db.query(Document).filter(Document.indexed == True).all()
        return [str(doc.id) for doc in documents]

    def _create_no_context_answer(
        self, project_id: str, question_id: str, question: Question
    ) -> Dict[str, Any]:
        """Create answer when no context is available"""
        answer = Answer(
            project_id=as_uuid(project_id),
            question_id=as_uuid(question_id),
            answer_text="Unable to answer: No relevant documents found in the project scope.",
            confidence_score=0.0,
            is_answerable=False,
            status=AnswerStatus.MISSING_DATA,
            citations=[],
        )
        self.db.add(answer)
        self.db.commit()
        self.db.refresh(answer)
        return self._format_answer_response(answer)

    def _create_no_context_project_answers(
        self, project_id: str, questions: List[Question]
    ) -> Dict[str, Any]:
        """Create answers for all questions when no context is available"""
        results = []
        project_uuid = as_uuid(project_id)
        for question in questions:
            answer = Answer(
                project_id=project_uuid,
                question_id=question.id,
                answer_text="Unable to answer: No relevant documents found in the project scope.",
                confidence_score=0.0,
                is_answerable=False,
                status=AnswerStatus.MISSING_DATA,
                citations=[],
            )
            self.db.add(answer)
            results.append(self._format_answer_response(answer))
        self.db.commit()
        return {
            "success": True,
            "project_id": project_id,
            "total_questions": len(questions),
            "successful": len(questions),
            "failed": 0,
            "results": results,
            "message": "No documents found in project scope",
        }

    def _format_answer_response(
        self,
        answer: Answer,
        llm_response: Optional[Dict] = None,
        evaluation: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Format answer response for API"""
        response = {
            "id": str(answer.id),
            "project_id": str(answer.project_id),
            "question_id": str(answer.question_id),
            "answer_text": answer.answer_text,
            "manual_answer": answer.manual_answer,
            "confidence_score": answer.confidence_score,
            "is_answerable": answer.is_answerable,
            "citations": answer.citations or [],
            "rejection_reason": answer.rejection_reason,
            "status": answer.status,
            "created_at": answer.created_at,
            "updated_at": answer.updated_at,
        }

        if llm_response:
            response["llm_metadata"] = {
                "model_used": llm_response.get("model_used"),
                "relevant_chunks_count": llm_response.get("relevant_chunks_count"),
                "context_length": llm_response.get("context_length"),
            }

        if evaluation:
            response["evaluation"] = evaluation

        return response


# Global answer generation service instance (will be initialized with db session)
def get_answer_generation_service(db: Session) -> AnswerGenerationService:
    return AnswerGenerationService(db)
