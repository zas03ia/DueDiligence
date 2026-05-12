from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Database Configuration
    database_url: str = "postgresql://postgres:postgres@localhost:5432/due_diligence"
    
    # Groq API Configuration
    groq_api_key: str
    groq_model: str = "llama3-70b-8192"
    
    # Redis Configuration
    redis_url: str = "redis://localhost:6379/0"
    
    # ChromaDB Configuration
    chroma_host: str = "localhost"
    chroma_port: int = 8000
    chroma_persist_directory: str = "./chroma_db"
    
    # JWT Configuration
    secret_key: str
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Application Configuration
    debug: bool = False
    api_v1_str: str = "/api/v1"
    project_name: str = "Due Diligence Questionnaire Agent"
    
    # File Upload Configuration
    max_file_size: int = 50 * 1024 * 1024  # 50MB
    upload_dir: str = "./uploads"
    
    # Background Task Configuration
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"
    
    # Embedding Configuration
    embedding_model: str = "all-MiniLM-L6-v2"
    chunk_size: int = 1000
    chunk_overlap: int = 200
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
