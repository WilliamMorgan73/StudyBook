from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AssignmentKind, AssignmentStatus
from app.schemas.attachment import AttachmentRead
from app.schemas.todo import TodoRead


class AssignmentBase(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    status: AssignmentStatus = AssignmentStatus.not_started
    weight_percent: float = Field(gt=0, le=100)
    grade_earned: float | None = None
    grade_max: float | None = None
    notes_markdown: str = ""
    kind: AssignmentKind = AssignmentKind.coursework
    duration_minutes: int | None = Field(default=None, gt=0)
    location: str | None = None


class CoveredSubmodule(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str


class AssignmentCreate(AssignmentBase):
    module_id: int
    # None means "use the default": all of the Module's Submodules for an exam, none for coursework.
    covered_submodule_ids: list[int] | None = None


class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_at: datetime | None = None
    status: AssignmentStatus | None = None
    weight_percent: float | None = Field(default=None, gt=0, le=100)
    grade_earned: float | None = None
    grade_max: float | None = None
    notes_markdown: str | None = None
    kind: AssignmentKind | None = None
    duration_minutes: int | None = Field(default=None, gt=0)
    location: str | None = None
    covered_submodule_ids: list[int] | None = None


class AssignmentRead(AssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    attachments: list[AttachmentRead] = []
    todos: list[TodoRead] = []
    covered_submodules: list[CoveredSubmodule] = []
