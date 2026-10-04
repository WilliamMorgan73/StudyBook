from pydantic import BaseModel, ConfigDict, Field

from app.schemas.assignment import AssignmentRead
from app.schemas.dashboard_layout import DashboardLayout
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


class ModuleUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    color: str | None = None
    term: str | None = None
    credits: int | None = None
    # A list sets the module page's layout; null resets it to the default; omit to leave it unchanged.
    dashboard_layout: DashboardLayout | None = Field(default=None, max_length=32)


class ModuleRead(ModuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class AssignmentProgress(BaseModel):
    graded: int
    in_progress: int
    not_started: int
    total: int


class CompletionProgress(BaseModel):
    """Weight-based (not count-based) progress, for the module progress ring."""

    completed_fraction: float
    achieved_fraction: float


class ModuleSummary(ModuleRead):
    """Module plus derived fields for the home/dashboard views."""

    current_grade: float | None = None
    next_lecture_at: str | None = None
    assignment_progress: AssignmentProgress
    completion_progress: CompletionProgress


class ModuleDetail(ModuleSummary):
    """Full module page payload: lectures, assignments, submodules, flashcards, related modules."""

    lectures: list[LectureRead] = []
    assignments: list[AssignmentRead] = []
    submodules: list[SubmoduleRead] = []
    flashcards: list[FlashcardRead] = []
    related_modules: list[ModuleRead] = []
    # Null: the frontend's default module layout.
    dashboard_layout: DashboardLayout | None = None
