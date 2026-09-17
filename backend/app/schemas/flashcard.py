from datetime import datetime

from pydantic import BaseModel, ConfigDict


class FlashcardBase(BaseModel):
    front: str
    back: str
    note_id: int | None = None


class FlashcardCreate(FlashcardBase):
    module_id: int


class FlashcardRead(FlashcardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime
    last_reviewed_at: datetime | None


class FlashcardReview(BaseModel):
    """Grade of the last recall attempt, SM-2 scale 0-5 (>=3 counts as correct)."""

    quality: int
