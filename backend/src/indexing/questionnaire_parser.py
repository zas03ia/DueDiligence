import os
import re
import uuid
from typing import List, Dict, Any, Optional
from pathlib import Path
import PyPDF2
from src.models.enums import QuestionType
from src.utils.exceptions import IndexingError


class QuestionnaireParser:
    """Parser for ILPA Due Diligence Questionnaire PDF"""
    
    def __init__(self):
        self.question_patterns = [
            # Common question indicators
            r'^\d+\.\s*(.+)',  # Numbered questions
            r'^[A-Z]+\.\s*(.+)',  # Lettered questions
            r'^\([a-z]\)\s*(.+)',  # Parenthesized letter questions
            r'^\([0-9]+\)\s*(.+)',  # Parenthesized number questions
        ]
        
        self.section_patterns = [
            r'^[A-Z][A-Z\s]+$',  # All caps sections
            r'^Section\s+[A-Z\d]+',  # Section headers
            r'^[IVX]+\.\s*.+',  # Roman numeral sections
        ]
        
        self.question_type_indicators = {
            "yes/no": QuestionType.BOOLEAN,
            "true/false": QuestionType.BOOLEAN,
            "explain": QuestionType.TEXT,
            "describe": QuestionType.TEXT,
            "list": QuestionType.TEXT,
            "provide": QuestionType.TEXT,
            "when": QuestionType.TEXT,
            "how": QuestionType.TEXT,
            "what": QuestionType.TEXT,
            "why": QuestionType.TEXT,
            "who": QuestionType.TEXT,
            "where": QuestionType.TEXT,
            "date": QuestionType.DATE,
            "number": QuestionType.NUMERIC,
            "amount": QuestionType.NUMERIC,
            "percentage": QuestionType.NUMERIC,
            "rate": QuestionType.NUMERIC,
        }
    
    def parse_questionnaire(self, file_path: str) -> Dict[str, Any]:
        """Parse questionnaire PDF into structured questions"""
        if not os.path.exists(file_path):
            raise IndexingError(f"Questionnaire file not found: {file_path}")
        
        try:
            # Extract text from PDF
            text_content = self._extract_pdf_text(file_path)
            
            # Parse sections and questions
            sections = self._parse_sections(text_content)
            questions = self._parse_questions(text_content, sections)
            
            # Structure the result
            questionnaire_data = {
                "filename": os.path.basename(file_path),
                "total_questions": len(questions),
                "sections": sections,
                "questions": questions,
                "metadata": self._extract_metadata(file_path)
            }
            
            return questionnaire_data
            
        except Exception as e:
            raise IndexingError(f"Failed to parse questionnaire: {str(e)}")
    
    def _extract_pdf_text(self, file_path: str) -> List[Dict[str, str]]:
        """Extract text from PDF with page numbers"""
        text_content = []
        
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text.strip():
                            text_content.append({
                                "page": page_num + 1,
                                "text": page_text.strip()
                            })
                    except Exception as e:
                        print(f"Warning: Failed to extract text from page {page_num + 1}: {e}")
                        continue
        
        except Exception as e:
            raise IndexingError(f"PDF text extraction failed: {str(e)}")
        
        return text_content
    
    def _parse_sections(self, text_content: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        """Parse sections from questionnaire text"""
        sections = []
        current_section = None
        
        for page in text_content:
            lines = page["text"].split('\n')
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                # Check if line is a section header
                is_section = False
                for pattern in self.section_patterns:
                    if re.match(pattern, line, re.IGNORECASE):
                        is_section = True
                        break
                
                if is_section:
                    # Save previous section if exists
                    if current_section:
                        sections.append(current_section)
                    
                    # Start new section
                    current_section = {
                        "name": line,
                        "page": page["page"],
                        "questions": []
                    }
        
        # Add last section
        if current_section:
            sections.append(current_section)
        
        # If no sections found, create a default one
        if not sections:
            sections.append({
                "name": "General",
                "page": 1,
                "questions": []
            })
        
        return sections
    
    def _parse_questions(self, text_content: List[Dict[str, str]], 
                        sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parse questions from questionnaire text"""
        questions = []
        question_counter = 1
        
        for page in text_content:
            lines = page["text"].split('\n')
            
            for line_num, line in enumerate(lines):
                line = line.strip()
                if not line:
                    continue
                
                # Check if line is a question
                question_match = None
                for pattern in self.question_patterns:
                    match = re.match(pattern, line, re.IGNORECASE)
                    if match:
                        question_match = match
                        break
                
                if question_match:
                    question_text = question_match.group(1).strip()
                    
                    # Determine question type
                    question_type = self._determine_question_type(question_text)
                    
                    # Extract options if multiple choice
                    options = self._extract_multiple_choice_options(lines, line_num)
                    if options:
                        question_type = QuestionType.MULTIPLE_CHOICE
                    
                    # Determine which section this question belongs to
                    section_name = self._find_section_for_page(page["page"], sections)
                    
                    question = {
                        "id": str(uuid.uuid4()),
                        "text": question_text,
                        "question_type": question_type,
                        "section": section_name,
                        "order": question_counter,
                        "page": page["page"],
                        "options": options if options else None,
                        "raw_text": line
                    }
                    
                    questions.append(question)
                    question_counter += 1
        
        return questions
    
    def _determine_question_type(self, question_text: str) -> QuestionType:
        """Determine question type from question text"""
        question_lower = question_text.lower()
        
        # Check for boolean indicators
        boolean_indicators = ["yes/no", "true/false", "is", "are", "was", "were", "will", "would", "could", "should"]
        if any(indicator in question_lower for indicator in boolean_indicators):
            return QuestionType.BOOLEAN
        
        # Check for numeric indicators
        numeric_indicators = ["how many", "how much", "what amount", "what number", "percentage", "rate", "count"]
        if any(indicator in question_lower for indicator in numeric_indicators):
            return QuestionType.NUMERIC
        
        # Check for date indicators
        date_indicators = ["when", "what date", "what year", "what month", "what time"]
        if any(indicator in question_lower for indicator in date_indicators):
            return QuestionType.DATE
        
        # Default to text
        return QuestionType.TEXT
    
    def _extract_multiple_choice_options(self, lines: List[str], question_line_num: int) -> Optional[List[str]]:
        """Extract multiple choice options from following lines"""
        options = []
        option_patterns = [
            r'^[a-z]\.\s*(.+)',  # a. Option 1
            r'^[A-Z]\.\s*(.+)',  # A. Option 1
            r'^\([a-z]\)\s*(.+)',  # (a) Option 1
            r'^\([A-Z]\)\s*(.+)',  # (A) Option 1
        ]
        
        # Check next few lines for options
        for i in range(question_line_num + 1, min(question_line_num + 6, len(lines))):
            line = lines[i].strip()
            if not line:
                continue
            
            # Check if line is an option
            for pattern in option_patterns:
                match = re.match(pattern, line)
                if match:
                    option_text = match.group(1).strip()
                    options.append(option_text)
                    break
            else:
                # If no option pattern matches, we've likely reached the end of options
                if options:  # Only break if we've already found some options
                    break
        
        return options if len(options) >= 2 else None
    
    def _find_section_for_page(self, page_num: int, sections: List[Dict[str, Any]]) -> str:
        """Find which section a page belongs to"""
        if not sections:
            return "General"
        
        # Find the last section that starts on or before this page
        current_section = sections[0]["name"]
        for section in sections:
            if section["page"] <= page_num:
                current_section = section["name"]
            else:
                break
        
        return current_section
    
    def _extract_metadata(self, file_path: str) -> Dict[str, Any]:
        """Extract metadata from questionnaire file"""
        metadata = {
            "filename": os.path.basename(file_path),
            "file_size": os.path.getsize(file_path),
            "file_type": "PDF"
        }
        
        try:
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                if pdf_reader.metadata:
                    metadata.update({
                        "title": pdf_reader.metadata.get('/Title', ''),
                        "author": pdf_reader.metadata.get('/Author', ''),
                        "subject": pdf_reader.metadata.get('/Subject', ''),
                        "creator": pdf_reader.metadata.get('/Creator', ''),
                        "producer": pdf_reader.metadata.get('/Producer', ''),
                        "creation_date": str(pdf_reader.metadata.get('/CreationDate', '')),
                        "pages": len(pdf_reader.pages)
                    })
                else:
                    metadata["pages"] = len(pdf_reader.pages)
        
        except Exception as e:
            print(f"Warning: Failed to extract PDF metadata: {e}")
        
        return metadata
    
    def validate_parsed_questions(self, questions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate parsed questions and return statistics"""
        if not questions:
            return {"error": "No questions found"}
        
        question_types = {}
        sections = {}
        pages = set()
        
        for question in questions:
            # Count question types
            q_type = question.get("question_type", "UNKNOWN")
            question_types[q_type] = question_types.get(q_type, 0) + 1
            
            # Count sections
            section = question.get("section", "Unknown")
            sections[section] = sections.get(section, 0) + 1
            
            # Track pages
            if "page" in question:
                pages.add(question["page"])
        
        return {
            "total_questions": len(questions),
            "question_types": question_types,
            "sections": sections,
            "pages_spanned": len(pages),
            "avg_questions_per_page": len(questions) / len(pages) if pages else 0
        }


# Global questionnaire parser instance
questionnaire_parser = QuestionnaireParser()
