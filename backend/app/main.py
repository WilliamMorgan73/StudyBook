from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import assignments, calendar, flashcards, lectures, modules, notes
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
app.include_router(notes.router)
app.include_router(flashcards.router)
app.include_router(lectures.router)
app.include_router(calendar.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
