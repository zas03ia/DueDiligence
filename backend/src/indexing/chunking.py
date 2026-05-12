import os
import uuid
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from src.models.enums import ChunkingStrategy
import re
import nltk
from nltk.tokenize import sent_tokenize, word_tokenize
from nltk.corpus import stopwords
import numpy as np


# Download required NLTK data with proper error handling
def download_nltk_data():
    """Download required NLTK data with proper error handling"""
    try:
        nltk.data.find("tokenizers/punkt")
    except LookupError:
        try:
            print("Downloading NLTK 'punkt' data...")
            nltk.download("punkt", quiet=True)
        except Exception as e:
            print(f"Failed to download NLTK 'punkt' data: {e}")
            raise

    try:
        nltk.data.find("corpora/stopwords")
    except LookupError:
        try:
            print("Downloading NLTK 'stopwords' data...")
            nltk.download("stopwords", quiet=True)
        except Exception as e:
            print(f"Failed to download NLTK 'stopwords' data: {e}")
            raise


# Download data when module is imported
download_nltk_data()


@dataclass
class DocumentChunk:
    """Represents a chunk of document with metadata"""

    id: str
    text: str
    chunk_type: str
    start_index: int
    end_index: int
    metadata: Dict[str, Any]
    source_section: Optional[str] = None
    page_number: Optional[int] = None
    slide_number: Optional[int] = None
    sheet_name: Optional[str] = None


class DocumentChunker:
    """Intelligent document chunking with multiple strategies"""

    def __init__(self, default_strategy: ChunkingStrategy = ChunkingStrategy.PARAGRAPH):
        self.default_strategy = default_strategy
        self.stop_words = set(stopwords.words("english"))

    def chunk_document(
        self,
        parsed_content: Dict[str, Any],
        strategy: Optional[ChunkingStrategy] = None,
    ) -> List[DocumentChunk]:
        """Chunk parsed document content using specified strategy"""
        strategy = strategy or self.default_strategy
        text_content = parsed_content.get("text_content", [])

        if strategy == ChunkingStrategy.FIXED_SIZE:
            return self._fixed_size_chunking(parsed_content)
        elif strategy == ChunkingStrategy.SENTENCE:
            return self._sentence_chunking(parsed_content)
        elif strategy == ChunkingStrategy.PARAGRAPH:
            return self._paragraph_chunking(parsed_content)
        elif strategy == ChunkingStrategy.SEMANTIC:
            return self._semantic_chunking(parsed_content)
        else:
            raise ValueError(f"Unsupported chunking strategy: {strategy}")

    def _fixed_size_chunking(
        self, parsed_content: Dict[str, Any], chunk_size: int = 1000, overlap: int = 200
    ) -> List[DocumentChunk]:
        """Fixed-size chunking with overlap"""
        chunks = []
        text_content = parsed_content.get("text_content", [])

        for section in text_content:
            text = section.get("text", "")
            if not text.strip():
                continue

            # Use existing chunks if available
            if "chunks" in section:
                for i, chunk_text in enumerate(section["chunks"]):
                    chunk = DocumentChunk(
                        id=f"{section.get('page', section.get('slide', section.get('sheet', 'section')))}_{i}",
                        text=chunk_text,
                        chunk_type="fixed_size",
                        start_index=i * chunk_size,
                        end_index=min((i + 1) * chunk_size, len(text)),
                        metadata={
                            "strategy": "fixed_size",
                            "chunk_size": chunk_size,
                            "overlap": overlap,
                        },
                        source_section=section.get("section"),
                        page_number=section.get("page"),
                        slide_number=section.get("slide"),
                        sheet_name=section.get("sheet"),
                    )
                    chunks.append(chunk)
            else:
                # Create chunks manually
                chunks.extend(
                    self._create_fixed_chunks(text, section, chunk_size, overlap)
                )

        return chunks

    def _sentence_chunking(
        self, parsed_content: Dict[str, Any], sentences_per_chunk: int = 5
    ) -> List[DocumentChunk]:
        """Sentence-based chunking"""
        chunks = []
        text_content = parsed_content.get("text_content", [])

        for section in text_content:
            text = section.get("text", "")
            if not text.strip():
                continue

            try:
                sentences = sent_tokenize(text)

                for i in range(0, len(sentences), sentences_per_chunk):
                    chunk_sentences = sentences[i : i + sentences_per_chunk]
                    chunk_text = " ".join(chunk_sentences)

                    section_id = section.get(
                        "page", section.get("slide", section.get("sheet", "section"))
                    )
                    chunk = DocumentChunk(
                        id=f"{section_id}_sent_{i // sentences_per_chunk}",
                        text=chunk_text,
                        chunk_type="sentence",
                        start_index=i,
                        end_index=min(i + sentences_per_chunk, len(sentences)),
                        metadata={
                            "strategy": "sentence",
                            "sentence_count": len(chunk_sentences),
                        },
                        source_section=section.get("section"),
                        page_number=section.get("page"),
                        slide_number=section.get("slide"),
                        sheet_name=section.get("sheet"),
                    )
                    chunks.append(chunk)

            except Exception as e:
                print(f"Error in sentence chunking: {e}")
                # Fallback to fixed-size chunking
                chunks.extend(self._fixed_size_chunking(parsed_content))

        return chunks

    def _paragraph_chunking(
        self, parsed_content: Dict[str, Any]
    ) -> List[DocumentChunk]:
        """Paragraph-based chunking"""
        chunks = []
        text_content = parsed_content.get("text_content", [])

        for section in text_content:
            text = section.get("text", "")
            if not text.strip():
                continue

            # Split by double newlines (paragraphs)
            paragraphs = re.split(r"\n\s*\n", text.strip())

            for i, paragraph in enumerate(paragraphs):
                if paragraph.strip():
                    section_id = section.get(
                        "page", section.get("slide", section.get("sheet", "section"))
                    )
                    chunk = DocumentChunk(
                        id=f"{section_id}_para_{i}",
                        text=paragraph.strip(),
                        chunk_type="paragraph",
                        start_index=i,
                        end_index=i + 1,
                        metadata={
                            "strategy": "paragraph",
                            "paragraph_length": len(paragraph.strip()),
                        },
                        source_section=section.get("section"),
                        page_number=section.get("page"),
                        slide_number=section.get("slide"),
                        sheet_name=section.get("sheet"),
                    )
                    chunks.append(chunk)

        return chunks

    def _semantic_chunking(self, parsed_content: Dict[str, Any]) -> List[DocumentChunk]:
        """Semantic chunking using sentence similarity (simplified version)"""
        chunks = []
        text_content = parsed_content.get("text_content", [])

        for section in text_content:
            text = section.get("text", "")
            if not text.strip():
                continue

            try:
                sentences = sent_tokenize(text)

                # Group sentences into semantic chunks
                current_chunk = []
                current_chunk_text = ""

                for i, sentence in enumerate(sentences):
                    current_chunk.append(sentence)
                    current_chunk_text += " " + sentence

                    # Start new chunk if semantic boundary is detected
                    if (
                        self._is_semantic_boundary(sentence, current_chunk)
                        and len(current_chunk) >= 3
                    ):
                        section_id = section.get(
                            "page",
                            section.get("slide", section.get("sheet", "section")),
                        )
                        chunk = DocumentChunk(
                            id=f"{section_id}_sem_{len(chunks)}",
                            text=current_chunk_text.strip(),
                            chunk_type="semantic",
                            start_index=i - len(current_chunk) + 1,
                            end_index=i,
                            metadata={
                                "strategy": "semantic",
                                "sentence_count": len(current_chunk),
                            },
                            source_section=section.get("section"),
                            page_number=section.get("page"),
                            slide_number=section.get("slide"),
                            sheet_name=section.get("sheet"),
                        )
                        chunks.append(chunk)
                        current_chunk = []
                        current_chunk_text = ""

                # Add remaining sentences
                if current_chunk:
                    section_id = section.get(
                        "page", section.get("slide", section.get("sheet", "section"))
                    )
                    chunk = DocumentChunk(
                        id=f"{section_id}_sem_final",
                        text=current_chunk_text.strip(),
                        chunk_type="semantic",
                        start_index=len(sentences) - len(current_chunk),
                        end_index=len(sentences) - 1,
                        metadata={
                            "strategy": "semantic",
                            "sentence_count": len(current_chunk),
                        },
                        source_section=section.get("section"),
                        page_number=section.get("page"),
                        slide_number=section.get("slide"),
                        sheet_name=section.get("sheet"),
                    )
                    chunks.append(chunk)

            except Exception as e:
                print(f"Error in semantic chunking: {e}")
                # Fallback to paragraph chunking
                chunks.extend(self._paragraph_chunking(parsed_content))

        return chunks

    def _create_fixed_chunks(
        self, text: str, section: Dict[str, Any], chunk_size: int, overlap: int
    ) -> List[DocumentChunk]:
        """Create fixed-size chunks from text"""
        chunks = []
        start = 0
        chunk_id = 0

        while start < len(text):
            end = start + chunk_size

            # Try to break at word boundary
            if end < len(text):
                last_space = text.rfind(" ", start, end)
                if last_space > start:
                    end = last_space

            chunk_text = text[start:end].strip()
            if chunk_text:
                section_id = section.get(
                    "page", section.get("slide", section.get("sheet", "section"))
                )
                chunk = DocumentChunk(
                    id=f"{section_id}_fixed_{chunk_id}",
                    text=chunk_text,
                    chunk_type="fixed_size",
                    start_index=start,
                    end_index=end,
                    metadata={
                        "strategy": "fixed_size",
                        "chunk_size": chunk_size,
                        "overlap": overlap,
                    },
                    source_section=section.get("section"),
                    page_number=section.get("page"),
                    slide_number=section.get("slide"),
                    sheet_name=section.get("sheet"),
                )
                chunks.append(chunk)
                chunk_id += 1

            start = max(start + 1, end - overlap)

        return chunks

    def _is_semantic_boundary(self, sentence: str, current_chunk: List[str]) -> bool:
        """Determine if sentence represents a semantic boundary"""
        # Simple heuristic: boundary indicators
        boundary_indicators = [
            "therefore",
            "however",
            "in conclusion",
            "furthermore",
            "additionally",
            "moreover",
            "consequently",
            "thus",
            "first",
            "second",
            "third",
            "finally",
            "in summary",
        ]

        sentence_lower = sentence.lower().strip()

        # Check for boundary indicators
        for indicator in boundary_indicators:
            if sentence_lower.startswith(indicator):
                return True

        # Check for question-answer patterns
        if sentence.endswith("?") and len(current_chunk) > 2:
            return True

        # Check for enumeration
        if re.match(r"^\d+\.", sentence.strip()):
            return True

        return False

    def get_chunk_statistics(self, chunks: List[DocumentChunk]) -> Dict[str, Any]:
        """Get statistics about chunks"""
        if not chunks:
            return {}

        chunk_lengths = [len(chunk.text) for chunk in chunks]

        return {
            "total_chunks": len(chunks),
            "min_chunk_length": min(chunk_lengths),
            "max_chunk_length": max(chunk_lengths),
            "avg_chunk_length": np.mean(chunk_lengths),
            "chunk_types": list(set(chunk.chunk_type for chunk in chunks)),
        }
