from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from src.config import settings
from src.storage.database import get_db, create_tables
from src.models.schemas import Project, ProjectCreate, ProjectUpdate, ProjectResponse
from src.services.project_service import ProjectService
from src.utils.exceptions import DueDiligenceException
from src.api import projects, documents, answers
import uvicorn

# Create FastAPI app
app = FastAPI(
    title=settings.project_name,
    description="Due Diligence Questionnaire Agent API",
    version="1.0.0",
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(projects.router)
app.include_router(documents.router)
app.include_router(answers.router)


@app.on_event("startup")
async def startup_event():
    """Initialize database tables"""
    create_tables()


@app.get("/health")
def health_check() -> dict:
    """Health check endpoint"""
    return {"status": "ok", "service": settings.project_name}


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Due Diligence Questionnaire Agent API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=settings.debug)
