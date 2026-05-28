import os
import json
from typing import List, Dict, Any, Optional
from groq import Groq
import groq as groq_sdk
from src.config import settings
from src.utils.exceptions import GenerationError
import time
import re


class LLMAuthError(GenerationError):
    """Raised when the Groq API key is missing or invalid."""


class LLMRateLimitError(GenerationError):
    """Raised when the Groq API rate limit is exceeded."""


class LLMContextTooLongError(GenerationError):
    """Raised when the prompt exceeds the model context window."""


class LLMModelError(GenerationError):
    """Raised when the requested model is unavailable or invalid."""


class GroqLLMService:
    """Groq LLM service for answer generation"""

    def __init__(self):
        if not settings.groq_api_key:
            raise LLMAuthError("Groq API key not configured — set GROQ_API_KEY in .env")

        self.client = Groq(api_key=settings.groq_api_key)
        self.model = settings.groq_model
        self.max_tokens = 4000
        self.temperature = 0.1  # Low temperature for consistent answers

    def generate_answer(
        self, question: str, context: List[str], question_type: str = "TEXT"
    ) -> Dict[str, Any]:
        """Generate answer for a question with context"""
        try:
            # Prepare context
            context_text = self._prepare_context(context)

            # Create prompt based on question type
            prompt = self._create_prompt(question, context_text, question_type)

            # Generate response
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": self._get_system_prompt(question_type),
                    },
                    {"role": "user", "content": prompt},
                ],
                max_tokens=self.max_tokens,
                temperature=self.temperature,
            )

            answer_text = response.choices[0].message.content

            # Parse response
            parsed_response = self._parse_llm_response(answer_text)

            # Add metadata
            parsed_response.update(
                {
                    "model_used": self.model,
                    "temperature": self.temperature,
                    "context_length": len(context_text),
                    "question_type": question_type,
                    "generation_time": time.time(),
                }
            )

            return parsed_response

        except groq_sdk.AuthenticationError as e:
            raise LLMAuthError(f"Groq API key is invalid or revoked: {str(e)}")
        except groq_sdk.RateLimitError as e:
            raise LLMRateLimitError(
                f"Groq rate limit exceeded — try again later: {str(e)}"
            )
        except groq_sdk.BadRequestError as e:
            msg = str(e)
            if (
                "context" in msg.lower()
                or "token" in msg.lower()
                or "length" in msg.lower()
            ):
                raise LLMContextTooLongError(
                    f"Prompt too long for model context window: {msg}"
                )
            raise LLMModelError(f"Groq bad request — check model name or prompt: {msg}")
        except groq_sdk.APIConnectionError as e:
            raise GenerationError(f"Cannot reach Groq API (network error): {str(e)}")
        except groq_sdk.APITimeoutError as e:
            raise GenerationError(f"Groq API request timed out: {str(e)}")
        except GenerationError:
            raise
        except Exception as e:
            raise GenerationError(f"Unexpected LLM error: {str(e)}")

    def generate_single_answer_with_citations(
        self, question: str, relevant_chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Generate answer with specific citations from chunks"""
        try:
            # Extract context and citation information
            context_texts = []
            citations = []

            for i, chunk in enumerate(relevant_chunks):
                context_texts.append(chunk["text"])
                citations.append(
                    {
                        "chunk_id": chunk.get("metadata", {}).get(
                            "chunk_id", f"chunk_{i}"
                        ),
                        "text": (
                            chunk["text"][:200] + "..."
                            if len(chunk["text"]) > 200
                            else chunk["text"]
                        ),
                        "similarity_score": chunk.get("similarity_score", 0.0),
                        "page_number": chunk.get("metadata", {}).get("page_number"),
                        "slide_number": chunk.get("metadata", {}).get("slide_number"),
                        "sheet_name": chunk.get("metadata", {}).get("sheet_name"),
                        "section": chunk.get("metadata", {}).get("source_section"),
                    }
                )

            # Generate answer
            response = self.generate_answer(question, context_texts)

            # Add citations to response
            response["citations"] = citations
            response["relevant_chunks_count"] = len(relevant_chunks)

            return response

        except GenerationError:
            raise
        except Exception as e:
            raise GenerationError(f"Failed to generate answer with citations: {str(e)}")

    def batch_generate_answers(
        self, questions_contexts: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Generate answers for multiple questions"""
        results = []

        for qc in questions_contexts:
            try:
                question = qc["question"]
                context = qc["context"]
                question_type = qc.get("question_type", "TEXT")

                result = self.generate_answer(question, context, question_type)
                result["question"] = question
                results.append(result)

            except Exception as e:
                results.append(
                    {
                        "question": qc.get("question", "Unknown"),
                        "error": str(e),
                        "success": False,
                    }
                )

        return results

    def evaluate_answer_quality(
        self, question: str, answer: str, reference_answer: Optional[str] = None
    ) -> Dict[str, Any]:
        """Evaluate the quality of a generated answer"""
        try:
            evaluation_prompt = f"""
            Evaluate the following answer for the given question:
            
            Question: {question}
            Answer: {answer}
            
            Please provide:
            1. A confidence score (0-1) indicating how confident you are in this answer
            2. An assessment of whether the question is answerable from the context
            3. A brief explanation of your reasoning
            
            Format your response as JSON:
            {{
                "confidence_score": 0.0-1.0,
                "is_answerable": true/false,
                "reasoning": "brief explanation",
                "answer_quality": "excellent/good/fair/poor"
            }}
            """

            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert evaluator of answer quality. Always respond in valid JSON format.",
                    },
                    {"role": "user", "content": evaluation_prompt},
                ],
                max_tokens=500,
                temperature=0.1,
            )

            evaluation_text = response.choices[0].message.content

            try:
                evaluation = json.loads(evaluation_text)
            except json.JSONDecodeError:
                # Fallback parsing if JSON is malformed
                evaluation = self._parse_evaluation_fallback(evaluation_text)

            return evaluation

        except groq_sdk.AuthenticationError as e:
            raise LLMAuthError(f"Groq API key is invalid or revoked: {str(e)}")
        except groq_sdk.RateLimitError as e:
            raise LLMRateLimitError(f"Groq rate limit exceeded: {str(e)}")
        except GenerationError:
            raise
        except Exception as e:
            raise GenerationError(f"Failed to evaluate answer quality: {str(e)}")

    def _prepare_context(self, context: List[str]) -> str:
        """Prepare context text for LLM"""
        if not context:
            return "No relevant context available."

        # Limit context length to avoid token limits
        max_context_length = 8000
        context_text = "\n\n---\n\n".join(context)

        if len(context_text) > max_context_length:
            # Truncate context while preserving complete chunks
            truncated_chunks = []
            current_length = 0

            for chunk in context:
                if (
                    current_length + len(chunk) + 10 <= max_context_length
                ):  # +10 for separator
                    truncated_chunks.append(chunk)
                    current_length += len(chunk) + 10
                else:
                    break

            context_text = "\n\n---\n\n".join(truncated_chunks)

        return context_text

    def _create_prompt(self, question: str, context: str, question_type: str) -> str:
        """Create prompt for LLM based on question type"""
        base_prompt = f"""
        Based on the following context, please answer the question.
        
        CONTEXT:
        {context}
        
        QUESTION:
        {question}
        """

        if question_type == "BOOLEAN":
            base_prompt += """
            
            Please answer with either "Yes" or "No" and provide a brief explanation.
            Format your response as:
            Answer: [Yes/No]
            Explanation: [brief explanation]
            """

        elif question_type == "NUMERIC":
            base_prompt += """
            
            Please provide a specific numerical answer. If an exact number is not available, provide the best estimate.
            Format your response as:
            Answer: [number]
            Explanation: [brief explanation]
            """

        elif question_type == "DATE":
            base_prompt += """
            
            Please provide a specific date. If an exact date is not available, provide the best estimate.
            Format your response as:
            Answer: [date]
            Explanation: [brief explanation]
            """

        else:  # TEXT
            base_prompt += """
            
            Please provide a comprehensive answer based on the context. If the context doesn't contain enough information to answer the question, please state that clearly.
            
            Format your response as:
            Answer: [your answer]
            Is Answerable: [Yes/No]
            Confidence: [0-1]
            """

        return base_prompt

    def _get_system_prompt(self, question_type: str) -> str:
        """Get system prompt based on question type"""
        base_system = """You are a helpful assistant specialized in answering questions based on provided context. 
        Always base your answers solely on the given context. If the context doesn't contain sufficient information, 
        clearly state that the question cannot be answered from the available information."""

        if question_type == "BOOLEAN":
            return (
                base_system
                + " For yes/no questions, always start with a clear 'Yes' or 'No' answer."
            )

        elif question_type == "NUMERIC":
            return (
                base_system
                + " For numerical questions, provide specific numbers with units when applicable."
            )

        elif question_type == "DATE":
            return (
                base_system
                + " For date questions, provide specific dates in a clear format."
            )

        return base_system

    def _parse_llm_response(self, response_text: str) -> Dict[str, Any]:
        """Parse LLM response into structured format"""
        try:
            # Initialize default values
            result = {
                "answer_text": response_text.strip(),
                "is_answerable": True,
                "confidence_score": 0.5,
            }

            # Try to extract structured information
            lines = response_text.strip().split("\n")

            for line in lines:
                line = line.strip()

                if line.lower().startswith("answer:"):
                    result["answer_text"] = line[7:].strip()
                elif line.lower().startswith("is answerable:"):
                    answerable = line[15:].strip().lower()
                    result["is_answerable"] = answerable in ["yes", "true", "1"]
                elif line.lower().startswith("confidence:"):
                    try:
                        conf_str = line[11:].strip()
                        result["confidence_score"] = float(conf_str)
                    except ValueError:
                        pass
                elif line.lower().startswith("explanation:"):
                    result["explanation"] = line[12:].strip()

            return result

        except Exception as e:
            # Fallback to raw response
            return {
                "answer_text": response_text.strip(),
                "is_answerable": True,
                "confidence_score": 0.5,
                "parsing_error": str(e),
            }

    def _parse_evaluation_fallback(self, evaluation_text: str) -> Dict[str, Any]:
        """Fallback parsing for evaluation if JSON fails"""
        result = {
            "confidence_score": 0.5,
            "is_answerable": True,
            "reasoning": evaluation_text[:200],
            "answer_quality": "fair",
        }

        # Try to extract confidence score
        confidence_match = re.search(
            r"confidence[_\s]*score[:\s]*([0-9.]+)", evaluation_text.lower()
        )
        if confidence_match:
            try:
                result["confidence_score"] = float(confidence_match.group(1))
            except ValueError:
                pass

        # Try to extract answerability
        answerable_match = re.search(
            r"answerable[:\s]*(yes|no|true|false)", evaluation_text.lower()
        )
        if answerable_match:
            result["is_answerable"] = answerable_match.group(1) in ["yes", "true"]

        return result

    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the LLM model"""
        return {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "provider": "Groq",
        }


# Lazy global instance — initialised on first use so a missing API key
# does not crash the whole application on startup.
_llm_service_instance: Optional[GroqLLMService] = None


def get_llm_service() -> GroqLLMService:
    global _llm_service_instance
    if _llm_service_instance is None:
        _llm_service_instance = GroqLLMService()
    return _llm_service_instance


# Keep backward-compat alias — accessing .llm_service triggers lazy init
class _LazyProxy:
    def __getattr__(self, name: str):
        return getattr(get_llm_service(), name)


llm_service = _LazyProxy()
