import os
import uuid
from typing import List, Dict, Any, Optional
import numpy as np
from sentence_transformers import SentenceTransformer
import torch
from src.config import settings
from src.indexing.chunking import DocumentChunk


class EmbeddingGenerator:
    """Generate embeddings for document chunks using SentenceTransformers"""
    
    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or settings.embedding_model
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._load_model()
    
    def _load_model(self):
        """Load the sentence transformer model"""
        try:
            print(f"Loading embedding model: {self.model_name}")
            self.model = SentenceTransformer(self.model_name, device=self.device)
            print(f"Model loaded successfully on device: {self.device}")
        except Exception as e:
            print(f"Error loading model {self.model_name}: {e}")
            # Fallback to a lighter model
            try:
                self.model_name = "all-MiniLM-L6-v2"
                self.model = SentenceTransformer(self.model_name, device=self.device)
                print(f"Fallback model loaded: {self.model_name}")
            except Exception as fallback_error:
                raise Exception(f"Failed to load both primary and fallback models: {fallback_error}")
    
    def generate_embeddings(self, chunks: List[DocumentChunk], 
                           batch_size: int = 32) -> List[DocumentChunk]:
        """Generate embeddings for document chunks"""
        if not self.model:
            raise RuntimeError("Model not loaded")
        
        texts = [chunk.text for chunk in chunks]
        
        try:
            # Generate embeddings in batches
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                show_progress_bar=True,
                convert_to_numpy=True,
                normalize_embeddings=True  # L2 normalization for cosine similarity
            )
            
            # Add embeddings to chunks
            for i, chunk in enumerate(chunks):
                chunk.embedding = embeddings[i].tolist()
                chunk.embedding_model = self.model_name
                chunk.embedding_dimension = embeddings.shape[1]
            
            return chunks
            
        except Exception as e:
            raise Exception(f"Error generating embeddings: {str(e)}")
    
    def generate_single_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        if not self.model:
            raise RuntimeError("Model not loaded")
        
        try:
            embedding = self.model.encode(
                text,
                convert_to_numpy=True,
                normalize_embeddings=True
            )
            return embedding.tolist()
            
        except Exception as e:
            raise Exception(f"Error generating single embedding: {str(e)}")
    
    def compute_similarity(self, embedding1: List[float], 
                         embedding2: List[float]) -> float:
        """Compute cosine similarity between two embeddings"""
        try:
            emb1 = np.array(embedding1)
            emb2 = np.array(embedding2)
            
            # Cosine similarity
            similarity = np.dot(emb1, emb2)
            return float(similarity)
            
        except Exception as e:
            raise Exception(f"Error computing similarity: {str(e)}")
    
    def find_similar_chunks(self, query_embedding: List[float], 
                           chunks: List[DocumentChunk], 
                           top_k: int = 5) -> List[Dict[str, Any]]:
        """Find most similar chunks to query embedding"""
        if not chunks:
            return []
        
        similarities = []
        for chunk in chunks:
            if hasattr(chunk, 'embedding') and chunk.embedding:
                similarity = self.compute_similarity(query_embedding, chunk.embedding)
                similarities.append({
                    "chunk": chunk,
                    "similarity": similarity,
                    "chunk_id": chunk.id
                })
        
        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        
        return similarities[:top_k]
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get information about the loaded model"""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "max_seq_length": self.model.max_seq_length if self.model else None,
            "embedding_dimension": self.model.get_sentence_embedding_dimension() if self.model else None
        }
    
    def test_embedding_quality(self, test_texts: List[str]) -> Dict[str, Any]:
        """Test embedding quality with sample texts"""
        if not test_texts:
            return {"error": "No test texts provided"}
        
        try:
            embeddings = []
            for text in test_texts:
                embedding = self.generate_single_embedding(text)
                embeddings.append(embedding)
            
            # Compute pairwise similarities
            similarities = []
            for i in range(len(embeddings)):
                for j in range(i + 1, len(embeddings)):
                    sim = self.compute_similarity(embeddings[i], embeddings[j])
                    similarities.append(sim)
            
            return {
                "model_info": self.get_model_info(),
                "num_texts": len(test_texts),
                "embedding_dimension": len(embeddings[0]) if embeddings else 0,
                "avg_similarity": np.mean(similarities) if similarities else 0,
                "similarity_range": {
                    "min": min(similarities) if similarities else 0,
                    "max": max(similarities) if similarities else 0
                }
            }
            
        except Exception as e:
            return {"error": f"Test failed: {str(e)}"}


class EmbeddingCache:
    """Cache for embeddings to avoid recomputation"""
    
    def __init__(self, cache_dir: str = "./embeddings_cache"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self.cache = {}
    
    def get_cache_key(self, text: str, model_name: str) -> str:
        """Generate cache key for text and model"""
        import hashlib
        content = f"{model_name}:{text}"
        return hashlib.md5(content.encode()).hexdigest()
    
    def get_embedding(self, text: str, model_name: str) -> Optional[List[float]]:
        """Get cached embedding"""
        cache_key = self.get_cache_key(text, model_name)
        
        # Check memory cache first
        if cache_key in self.cache:
            return self.cache[cache_key]
        
        # Check file cache
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.npy")
        if os.path.exists(cache_file):
            embedding = np.load(cache_file).tolist()
            self.cache[cache_key] = embedding
            return embedding
        
        return None
    
    def save_embedding(self, text: str, model_name: str, embedding: List[float]):
        """Save embedding to cache"""
        cache_key = self.get_cache_key(text, model_name)
        
        # Save to memory cache
        self.cache[cache_key] = embedding
        
        # Save to file cache
        cache_file = os.path.join(self.cache_dir, f"{cache_key}.npy")
        np.save(cache_file, np.array(embedding))
    
    def clear_cache(self):
        """Clear all cached embeddings"""
        self.cache.clear()
        for file in os.listdir(self.cache_dir):
            if file.endswith('.npy'):
                os.remove(os.path.join(self.cache_dir, file))


# Global embedding generator instance
embedding_generator = EmbeddingGenerator()
embedding_cache = EmbeddingCache()
