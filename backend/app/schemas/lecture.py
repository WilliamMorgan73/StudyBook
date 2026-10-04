from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LectureBase(BaseModel):
    title: str
    scheduled_at: datetime
    duration_minutes: int | None = None
    location: str | None = None
    week_number: int | None = None


class LectureCreate(LectureBase):
    module_id: int


class LectureUpdate(BaseModel):
    title: str | None = None
    scheduled_at: datetime | None = None
    duration_minutes: int | None = None
    location: str | None = None
    week_number: int | None = None


class LectureRead(LectureBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    feed_id: int | None = None
    """Set when the lecture is synced from a calendar feed; such lectures are read-only."""
