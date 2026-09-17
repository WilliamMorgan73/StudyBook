from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    assignments,
    attachments,
    calendar,
    flashcards,
    lectures,
    modules,
    submodules,
)
from app.core.config import settings

app = FastAPI(title="StudyBook API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(modules.router)
app.include_router(assignments.router)
app.include_router(submodules.router)
app.include_router(attachments.router)
app.include_router(flashcards.router)
app.include_router(lectures.router)
app.include_router(calendar.router)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
