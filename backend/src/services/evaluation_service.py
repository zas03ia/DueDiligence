import numpy as np
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from src.models.db_models import Project, Answer, Question
from src.models.enums import AnswerStatus
from src.services.llm_service import llm_service
from src.indexing.embeddings import embedding_generator
from sklearn.metrics.pairwise import cosine_similarity
import re
from collections import Counter


class EvaluationService:
    """Service for evaluating AI answers against human ground truth"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def evaluate_project_answers(self, project_id: str, 
                                ground_truth_answers: Dict[str, str]) -> Dict[str, Any]:
        """Evaluate all answers in a project against ground truth"""
        try:
            # Get project and answers
            project = self.db.query(Project).filter(Project.id == project_id).first()
            if not project:
                raise ValueError("Project not found")
            
            answers = self.db.query(Answer).filter(Answer.project_id == project_id).all()
            if not answers:
                return {"error": "No answers found for project"}
            
            # Evaluate each answer
            question_evaluations = []
            total_similarity = 0
            total_confidence = 0
            answerable_count = 0
            
            for answer in answers:
                question_id = str(answer.question_id)
                ground_truth = ground_truth_answers.get(question_id)
                
                if ground_truth:
                    evaluation = self.evaluate_single_answer(answer, ground_truth)
                    question_evaluations.append(evaluation)
                    
                    total_similarity += evaluation["similarity_score"]
                    total_confidence += answer.confidence_score
                    if answer.is_answerable:
                        answerable_count += 1
            
            # Calculate overall metrics
            num_evaluations = len(question_evaluations)
            overall_score = total_similarity / num_evaluations if num_evaluations > 0 else 0
            avg_confidence = total_confidence / len(answers) if answers else 0
            
            # Generate detailed report
            evaluation_report = self._generate_evaluation_report(
                project, question_evaluations, overall_score, avg_confidence
            )
            
            return {
                "project_id": project_id,
                "overall_score": overall_score,
                "avg_confidence": avg_confidence,
                "total_questions": len(answers),
                "evaluated_questions": num_evaluations,
                "answerable_rate": answerable_count / len(answers) if answers else 0,
                "question_evaluations": question_evaluations,
                "evaluation_report": evaluation_report,
                "similarity_metrics": self._calculate_similarity_metrics(question_evaluations)
            }
            
        except Exception as e:
            raise ValueError(f"Evaluation failed: {str(e)}")
    
    def evaluate_single_answer(self, answer: Answer, ground_truth: str) -> Dict[str, Any]:
        """Evaluate a single answer against ground truth"""
        try:
            ai_answer = answer.answer_text or ""
            manual_answer = answer.manual_answer or ""
            
            # Use manual answer if available, otherwise use AI answer
            answer_to_evaluate = manual_answer if manual_answer else ai_answer
            
            # Calculate similarity scores
            semantic_similarity = self._calculate_semantic_similarity(answer_to_evaluate, ground_truth)
            keyword_similarity = self._calculate_keyword_similarity(answer_to_evaluate, ground_truth)
            length_similarity = self._calculate_length_similarity(answer_to_evaluate, ground_truth)
            
            # Combined similarity score
            combined_similarity = self._combine_similarity_scores(
                semantic_similarity, keyword_similarity, length_similarity
            )
            
            # Evaluate answer quality
            quality_assessment = self._assess_answer_quality(
                answer_to_evaluate, ground_truth, combined_similarity
            )
            
            return {
                "answer_id": str(answer.id),
                "question_id": str(answer.question_id),
                "ai_answer": ai_answer,
                "manual_answer": manual_answer,
                "ground_truth": ground_truth,
                "evaluated_answer": answer_to_evaluate,
                "similarity_scores": {
                    "semantic": semantic_similarity,
                    "keyword": keyword_similarity,
                    "length": length_similarity,
                    "combined": combined_similarity
                },
                "confidence_score": answer.confidence_score,
                "is_answerable": answer.is_answerable,
                "status": answer.status,
                "quality_assessment": quality_assessment
            }
            
        except Exception as e:
            return {
                "answer_id": str(answer.id),
                "error": str(e),
                "similarity_scores": {"combined": 0.0}
            }
    
    def _calculate_semantic_similarity(self, text1: str, text2: str) -> float:
        """Calculate semantic similarity using embeddings"""
        try:
            # Generate embeddings
            embedding1 = embedding_generator.generate_single_embedding(text1)
            embedding2 = embedding_generator.generate_single_embedding(text2)
            
            # Calculate cosine similarity
            similarity = embedding_generator.compute_similarity(embedding1, embedding2)
            return float(similarity)
            
        except Exception as e:
            print(f"Error calculating semantic similarity: {e}")
            return 0.0
    
    def _calculate_keyword_similarity(self, text1: str, text2: str) -> float:
        """Calculate keyword overlap similarity"""
        try:
            # Extract keywords (simple word-based approach)
            words1 = self._extract_keywords(text1.lower())
            words2 = self._extract_keywords(text2.lower())
            
            if not words1 and not words2:
                return 1.0
            if not words1 or not words2:
                return 0.0
            
            # Calculate Jaccard similarity
            set1 = set(words1)
            set2 = set(words2)
            intersection = set1.intersection(set2)
            union = set1.union(set2)
            
            return len(intersection) / len(union) if union else 0.0
            
        except Exception as e:
            print(f"Error calculating keyword similarity: {e}")
            return 0.0
    
    def _calculate_length_similarity(self, text1: str, text2: str) -> float:
        """Calculate length-based similarity"""
        try:
            len1 = len(text1.split())
            len2 = len(text2.split())
            
            if len1 == 0 and len2 == 0:
                return 1.0
            
            # Calculate ratio similarity (penalize extreme differences)
            ratio = min(len1, len2) / max(len1, len2) if max(len1, len2) > 0 else 0
            return ratio
            
        except Exception as e:
            print(f"Error calculating length similarity: {e}")
            return 0.0
    
    def _combine_similarity_scores(self, semantic: float, keyword: float, length: float) -> float:
        """Combine different similarity scores with weights"""
        # Weighted combination (semantic is most important)
        weights = {
            "semantic": 0.6,
            "keyword": 0.3,
            "length": 0.1
        }
        
        combined = (
            semantic * weights["semantic"] +
            keyword * weights["keyword"] +
            length * weights["length"]
        )
        
        return float(combined)
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract keywords from text"""
        # Simple keyword extraction - can be enhanced with NLP libraries
        words = re.findall(r'\b[a-zA-Z]+\b', text)
        
        # Filter out common stop words (simplified list)
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
            'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they'
        }
        
        keywords = [word for word in words if word not in stop_words and len(word) > 2]
        return keywords
    
    def _assess_answer_quality(self, answer: str, ground_truth: str, 
                             similarity_score: float) -> Dict[str, Any]:
        """Assess the quality of the answer"""
        if similarity_score >= 0.8:
            quality = "excellent"
            description = "Answer closely matches ground truth"
        elif similarity_score >= 0.6:
            quality = "good"
            description = "Answer is substantially similar to ground truth"
        elif similarity_score >= 0.4:
            quality = "fair"
            description = "Answer has some similarity to ground truth but significant differences"
        else:
            quality = "poor"
            description = "Answer differs significantly from ground truth"
        
        return {
            "quality": quality,
            "description": description,
            "similarity_score": similarity_score
        }
    
    def _generate_evaluation_report(self, project: Project, 
                                   evaluations: List[Dict], overall_score: float,
                                   avg_confidence: float) -> Dict[str, Any]:
        """Generate a detailed evaluation report"""
        # Count quality assessments
        quality_counts = Counter([eval["quality_assessment"]["quality"] for eval in evaluations])
        
        # Calculate statistics
        similarity_scores = [eval["similarity_scores"]["combined"] for eval in evaluations]
        confidence_scores = [eval["confidence_score"] for eval in evaluations]
        
        return {
            "project_name": project.name,
            "evaluation_summary": {
                "overall_score": overall_score,
                "average_confidence": avg_confidence,
                "total_evaluated": len(evaluations),
                "quality_distribution": dict(quality_counts)
            },
            "score_statistics": {
                "similarity": {
                    "mean": np.mean(similarity_scores) if similarity_scores else 0,
                    "std": np.std(similarity_scores) if similarity_scores else 0,
                    "min": np.min(similarity_scores) if similarity_scores else 0,
                    "max": np.max(similarity_scores) if similarity_scores else 0
                },
                "confidence": {
                    "mean": np.mean(confidence_scores) if confidence_scores else 0,
                    "std": np.std(confidence_scores) if confidence_scores else 0,
                    "min": np.min(confidence_scores) if confidence_scores else 0,
                    "max": np.max(confidence_scores) if confidence_scores else 0
                }
            },
            "recommendations": self._generate_recommendations(overall_score, quality_counts)
        }
    
    def _generate_recommendations(self, overall_score: float, 
                                quality_counts: Counter) -> List[str]:
        """Generate recommendations based on evaluation results"""
        recommendations = []
        
        if overall_score < 0.5:
            recommendations.append("Consider improving document quality and relevance")
            recommendations.append("Review and enhance the question formulation")
        
        if quality_counts.get("poor", 0) > len(quality_counts) * 0.3:
            recommendations.append("Significant number of poor quality answers - review indexing strategy")
        
        if quality_counts.get("excellent", 0) > len(quality_counts) * 0.7:
            recommendations.append("High quality answers achieved - current approach is working well")
        
        if overall_score > 0.7 and overall_score < 0.8:
            recommendations.append("Good performance - consider fine-tuning confidence thresholds")
        
        return recommendations
    
    def _calculate_similarity_metrics(self, evaluations: List[Dict]) -> Dict[str, Any]:
        """Calculate detailed similarity metrics"""
        if not evaluations:
            return {}
        
        semantic_scores = [eval["similarity_scores"]["semantic"] for eval in evaluations]
        keyword_scores = [eval["similarity_scores"]["keyword"] for eval in evaluations]
        length_scores = [eval["similarity_scores"]["length"] for eval in evaluations]
        combined_scores = [eval["similarity_scores"]["combined"] for eval in evaluations]
        
        return {
            "semantic": {
                "mean": np.mean(semantic_scores),
                "std": np.std(semantic_scores),
                "min": np.min(semantic_scores),
                "max": np.max(semantic_scores)
            },
            "keyword": {
                "mean": np.mean(keyword_scores),
                "std": np.std(keyword_scores),
                "min": np.min(keyword_scores),
                "max": np.max(keyword_scores)
            },
            "length": {
                "mean": np.mean(length_scores),
                "std": np.std(length_scores),
                "min": np.min(length_scores),
                "max": np.max(length_scores)
            },
            "combined": {
                "mean": np.mean(combined_scores),
                "std": np.std(combined_scores),
                "min": np.min(combined_scores),
                "max": np.max(combined_scores)
            }
        }
    
    def compare_ai_vs_manual_answers(self, project_id: str) -> Dict[str, Any]:
        """Compare AI-generated answers with manual answers"""
        try:
            answers = self.db.query(Answer).filter(
                Answer.project_id == project_id,
                Answer.manual_answer.isnot(None)
            ).all()
            
            if not answers:
                return {"message": "No manual answers found for comparison"}
            
            comparisons = []
            for answer in answers:
                if answer.answer_text and answer.manual_answer:
                    similarity = self._calculate_semantic_similarity(
                        answer.answer_text, answer.manual_answer
                    )
                    
                    comparisons.append({
                        "answer_id": str(answer.id),
                        "question_id": str(answer.question_id),
                        "ai_answer": answer.answer_text,
                        "manual_answer": answer.manual_answer,
                        "similarity_score": similarity,
                        "ai_confidence": answer.confidence_score
                    })
            
            avg_similarity = np.mean([comp["similarity_score"] for comp in comparisons])
            
            return {
                "project_id": project_id,
                "total_comparisons": len(comparisons),
                "average_similarity": avg_similarity,
                "comparisons": comparisons
            }
            
        except Exception as e:
            raise ValueError(f"Comparison failed: {str(e)}")


# Global evaluation service instance (will be initialized with db session)
def get_evaluation_service(db: Session) -> EvaluationService:
    return EvaluationService(db)
