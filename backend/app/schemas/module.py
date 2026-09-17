from pydantic import BaseModel, ConfigDict

from app.schemas.assignment import AssignmentRead
from app.schemas.flashcard import FlashcardRead
from app.schemas.lecture import LectureRead
from app.schemas.submodule import SubmoduleRead


class ModuleBase(BaseModel):
    name: str
    code: str | None = None
    color: str = "#6366f1"
    term: str | None = None
    credits: int | None = None


class ModuleCreate(ModuleBase):
    pass


class ModuleRead(ModuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class ModuleSummary(ModuleRead):
    """Module plus derived fields for the home/dashboard views."""

    current_grade: float | None = None
    next_lecture_at: str | None = None


class ModuleDetail(ModuleSummary):
    """Full module page payload: lectures, assignments, submodules, flashcards, related modules."""

    lectures: list[LectureRead] = []
    assignments: list[AssignmentRead] = []
    submodules: list[SubmoduleRead] = []
    flashcards: list[FlashcardRead] = []
    related_modules: list[ModuleRead] = []
