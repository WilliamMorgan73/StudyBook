from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.assignment import AssignmentRead
from app.schemas.dashboard_layout import DashboardLayout
from app.schemas.flashcard import FlashcardRead
from app.schemas.lecture import LectureRead
from app.schemas.submodule import SubmoduleRead


class ModuleBanner(BaseModel):
    """The module page banner: which stats it shows, in order, and how it looks. Stat ids belong to
    the frontend and aren't validated beyond their shape."""

    stats: list[str] = Field(max_length=6)
    ring: bool = True
    tint: Literal["none", "soft", "strong"] = "soft"
    size: Literal["compact", "comfortable"] = "comfortable"

    @field_validator("stats")
    @classmethod
    def _stat_ids(cls, stats: list[str]) -> list[str]:
        if any(not 1 <= len(s) <= 32 for s in stats):
            raise ValueError("Stat ids must be 1-32 characters")
        return stats


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
    # Like dashboard_layout: a value sets it, null clears it, omit to leave it unchanged.
    notes: str | None = None
    banner: ModuleBanner | None = None


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
    notes: str | None = None
    # Null: the frontend's default banner.
    banner: ModuleBanner | None = None
