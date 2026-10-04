from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    ai,
    app_settings,
    assignments,
    attachments,
    backup,
    calendar,
    calendar_feeds,
    flashcards,
    lectures,
    modules,
    personal_events,
    quick_note,
    quick_todos,
    revision,
    submodule_ai,
    submodules,
)
from app.core.config import settings
from app.core.database import engine
from app.core.migrate import ensure_schema
from app.services.ai import AIError


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Only when the server starts (tests' plain `TestClient(app)` skips it and uses its own database).
    ensure_schema(engine)
    yield


app = FastAPI(title="StudyBook API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AIError)
def ai_error_handler(_request: Request, exc: AIError) -> JSONResponse:
    # `detail` is shown to the student as-is; `kind` lets the UI special-case e.g. not_configured.
    return JSONResponse(status_code=exc.http_status, content={"detail": exc.message, "kind": exc.kind})


app.include_router(app_settings.router)
app.include_router(ai.router)
app.include_router(modules.router)
app.include_router(assignments.router)
app.include_router(submodules.router)
app.include_router(submodule_ai.router)
app.include_router(attachments.router)
app.include_router(flashcards.router)
app.include_router(lectures.router)
app.include_router(calendar.router)
app.include_router(calendar_feeds.router)
app.include_router(personal_events.router)
app.include_router(revision.router)
app.include_router(quick_todos.router)
app.include_router(quick_note.router)
app.include_router(backup.router)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
