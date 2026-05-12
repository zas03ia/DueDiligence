import chromadb
from chromadb.config import Settings
from typing import List, Dict, Any, Optional
from src.config import settings


class ChromaVectorStore:
    """ChromaDB vector store implementation"""
    
    def __init__(self):
        self.client = chromadb.PersistentClient(path=settings.chroma_persist_directory)
        self.collections = {}
    
    def get_or_create_collection(self, name: str):
        """Get or create a collection"""
        if name not in self.collections:
            self.collections[name] = self.client.get_or_create_collection(name)
        return self.collections[name]
    
    def add_documents(self, collection_name: str, documents: List[str], 
                     metadatas: List[Dict[str, Any]], ids: List[str]):
        """Add documents to collection"""
        collection = self.get_or_create_collection(collection_name)
        collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
    
    def query(self, collection_name: str, query_text: str, 
              n_results: int = 5) -> Dict[str, Any]:
        """Query documents"""
        collection = self.get_or_create_collection(collection_name)
        return collection.query(
            query_texts=[query_text],
            n_results=n_results
        )
    
    def get_document(self, collection_name: str, doc_id: str) -> Dict[str, Any]:
        """Get specific document"""
        collection = self.get_or_create_collection(collection_name)
        return collection.get(ids=[doc_id])
    
    def delete_collection(self, collection_name: str):
        """Delete entire collection"""
        if collection_name in self.collections:
            del self.collections[collection_name]
        self.client.delete_collection(name=collection_name)


# Global vector store instance
vector_store = ChromaVectorStore()
