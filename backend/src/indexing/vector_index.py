import os
import uuid
from typing import List, Dict, Any, Optional, Tuple
from src.storage.vector_store import vector_store
from src.indexing.chunking import DocumentChunk
from src.indexing.embeddings import embedding_generator
from src.models.enums import DocumentType
import numpy as np


class VectorIndexManager:
    """Manages vector indexing for document chunks"""
    
    def __init__(self):
        self.collection_prefix = "doc_"
        self.citation_collection_prefix = "cite_"
    
    def index_document_chunks(self, document_id: str, chunks: List[DocumentChunk]) -> bool:
        """Index document chunks in vector store"""
        try:
            if not chunks:
                return False
            
            # Generate embeddings for chunks
            chunks_with_embeddings = embedding_generator.generate_embeddings(chunks)
            
            # Prepare data for ChromaDB
            documents = []
            metadatas = []
            ids = []
            
            for chunk in chunks_with_embeddings:
                documents.append(chunk.text)

                # ChromaDB only accepts str/int/float/bool — drop None values
                metadata = {
                    "document_id": document_id,
                    "chunk_id": chunk.id,
                    "chunk_type": chunk.chunk_type,
                    "start_index": chunk.start_index,
                    "end_index": chunk.end_index,
                    "embedding_model": getattr(chunk, 'embedding_model', '') or '',
                    "text_length": len(chunk.text),
                }
                if chunk.source_section is not None:
                    metadata["source_section"] = str(chunk.source_section)
                if chunk.page_number is not None:
                    metadata["page_number"] = int(chunk.page_number)
                if chunk.slide_number is not None:
                    metadata["slide_number"] = int(chunk.slide_number)
                if chunk.sheet_name is not None:
                    metadata["sheet_name"] = str(chunk.sheet_name)

                metadatas.append(metadata)
                ids.append(chunk.id)
            
            # Add to ChromaDB collection
            collection_name = f"{self.collection_prefix}{document_id}"
            vector_store.add_documents(
                collection_name=collection_name,
                documents=documents,
                metadatas=metadatas,
                ids=ids
            )
            
            return True
            
        except Exception as e:
            print(f"Error indexing document chunks: {e}")
            return False
    
    def search_similar_chunks(self, document_id: str, query_text: str, 
                            top_k: int = 5) -> List[Dict[str, Any]]:
        """Search for similar chunks within a document"""
        try:
            collection_name = f"{self.collection_prefix}{document_id}"
            results = vector_store.query(
                collection_name=collection_name,
                query_text=query_text,
                n_results=top_k
            )
            
            # Format results
            formatted_results = []
            if results and 'documents' in results and results['documents']:
                documents = results['documents'][0]  # First query result
                metadatas = results['metadatas'][0] if 'metadatas' in results else []
                distances = results['distances'][0] if 'distances' in results else []
                
                for i, doc in enumerate(documents):
                    result = {
                        "text": doc,
                        "metadata": metadatas[i] if i < len(metadatas) else {},
                        "similarity_score": 1 - distances[i] if i < len(distances) else 0.0
                    }
                    formatted_results.append(result)
            
            return formatted_results
            
        except Exception as e:
            print(f"Error searching similar chunks: {e}")
            return []
    
    def search_across_documents(self, document_ids: List[str], query_text: str, 
                               top_k: int = 10) -> List[Dict[str, Any]]:
        """Search across multiple documents"""
        all_results = []
        
        for doc_id in document_ids:
            results = self.search_similar_chunks(doc_id, query_text, top_k)
            all_results.extend(results)
        
        # Sort by similarity score
        all_results.sort(key=lambda x: x["similarity_score"], reverse=True)
        
        return all_results[:top_k]
    
    def get_document_chunks(self, document_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get all chunks for a document"""
        try:
            collection_name = f"{self.collection_prefix}{document_id}"
            collection = vector_store.get_or_create_collection(collection_name)
            
            # Get all documents from collection
            result = collection.get()
            
            if result and 'documents' in result and result['documents']:
                documents = result['documents']
                metadatas = result['metadatas'] if 'metadatas' in result else []
                ids = result['ids'] if 'ids' in result else []
                
                chunks = []
                for i, doc in enumerate(documents[:limit]):
                    chunk = {
                        "text": doc,
                        "metadata": metadatas[i] if i < len(metadatas) else {},
                        "id": ids[i] if i < len(ids) else str(i)
                    }
                    chunks.append(chunk)
                
                return chunks
            
            return []
            
        except Exception as e:
            print(f"Error getting document chunks: {e}")
            return []
    
    def delete_document_index(self, document_id: str) -> bool:
        """Delete document index from vector store"""
        try:
            collection_name = f"{self.collection_prefix}{document_id}"
            vector_store.delete_collection(collection_name)
            return True
        except Exception as e:
            print(f"Error deleting document index: {e}")
            return False
    
    def create_citation_index(self, document_id: str, chunks: List[DocumentChunk]) -> bool:
        """Create citation index with precise location information"""
        try:
            # Create separate collection for citations
            citation_collection_name = f"{self.citation_collection_prefix}{document_id}"
            
            # Prepare citation data
            citations = []
            metadatas = []
            ids = []
            
            for chunk in chunks:
                # ChromaDB only accepts str/int/float/bool — drop None values
                citation_metadata = {
                    "document_id": document_id,
                    "chunk_id": chunk.id,
                    "chunk_type": chunk.chunk_type,
                    "text_length": len(chunk.text),
                    "citation_type": "chunk",
                    "start_char": chunk.start_index,
                    "end_char": chunk.end_index,
                }
                if chunk.page_number is not None:
                    citation_metadata["page_number"] = int(chunk.page_number)
                if chunk.slide_number is not None:
                    citation_metadata["slide_number"] = int(chunk.slide_number)
                if chunk.sheet_name is not None:
                    citation_metadata["sheet_name"] = str(chunk.sheet_name)
                if chunk.source_section is not None:
                    citation_metadata["source_section"] = str(chunk.source_section)

                citations.append(chunk.text)
                metadatas.append(citation_metadata)
                ids.append(f"cite_{chunk.id}")
            
            # Add to citation collection
            vector_store.add_documents(
                collection_name=citation_collection_name,
                documents=citations,
                metadatas=metadatas,
                ids=ids
            )
            
            return True
            
        except Exception as e:
            print(f"Error creating citation index: {e}")
            return False
    
    def get_citation_context(self, document_id: str, chunk_id: str, 
                            context_window: int = 200) -> Dict[str, Any]:
        """Get citation context around a specific chunk"""
        try:
            # Get the specific chunk
            collection_name = f"{self.collection_prefix}{document_id}"
            chunk_result = vector_store.get_document(collection_name, chunk_id)
            
            if not chunk_result or 'documents' not in chunk_result:
                return {}
            
            chunk_text = chunk_result['documents'][0]
            chunk_metadata = chunk_result['metadatas'][0] if 'metadatas' in chunk_result else {}
            
            # Get surrounding chunks for context
            all_chunks = self.get_document_chunks(document_id)
            
            # Find the current chunk index
            current_index = -1
            for i, chunk in enumerate(all_chunks):
                if chunk.get('id') == chunk_id:
                    current_index = i
                    break
            
            if current_index == -1:
                return {"text": chunk_text, "metadata": chunk_metadata}
            
            # Get context chunks
            start_index = max(0, current_index - 2)  # 2 chunks before
            end_index = min(len(all_chunks), current_index + 3)  # 2 chunks after
            
            context_chunks = all_chunks[start_index:end_index]
            
            return {
                "text": chunk_text,
                "metadata": chunk_metadata,
                "context": context_chunks,
                "context_text": " ".join([chunk["text"] for chunk in context_chunks])
            }
            
        except Exception as e:
            print(f"Error getting citation context: {e}")
            return {}
    
    def get_index_statistics(self, document_id: str) -> Dict[str, Any]:
        """Get statistics about document index"""
        try:
            chunks = self.get_document_chunks(document_id)
            
            if not chunks:
                return {"error": "No chunks found"}
            
            text_lengths = [len(chunk["text"]) for chunk in chunks]
            chunk_types = [chunk["metadata"].get("chunk_type", "unknown") for chunk in chunks]
            
            return {
                "document_id": document_id,
                "total_chunks": len(chunks),
                "total_characters": sum(text_lengths),
                "avg_chunk_length": np.mean(text_lengths),
                "min_chunk_length": min(text_lengths),
                "max_chunk_length": max(text_lengths),
                "chunk_types": list(set(chunk_types)),
                "has_citations": any("page_number" in chunk["metadata"] or 
                                   "slide_number" in chunk["metadata"] 
                                   for chunk in chunks)
            }
            
        except Exception as e:
            return {"error": f"Failed to get statistics: {str(e)}"}


# Global vector index manager instance
vector_index_manager = VectorIndexManager()
