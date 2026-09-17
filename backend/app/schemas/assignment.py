from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import AssignmentStatus


class AssignmentBase(BaseModel):
    title: str
    description: str | None = None
    due_at: datetime | None = None
    status: AssignmentStatus = AssignmentStatus.not_started
    weight_percent: float = Field(gt=0, le=100)
    grade_earned: float | None = None
    grade_max: float | None = None


class AssignmentCreate(AssignmentBase):
    module_id: int


class AssignmentUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    due_at: datetime | None = None
    status: AssignmentStatus | None = None
    weight_percent: float | None = Field(default=None, gt=0, le=100)
    grade_earned: float | None = None
    grade_max: float | None = None


class AssignmentRead(AssignmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
