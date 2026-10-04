from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import FlashcardSource
from app.services.flashcard_generation import DEFAULT_CARD_COUNT, MAX_CARD_COUNT


class FlashcardBase(BaseModel):
    front: str
    back: str
    submodule_id: int | None = None
    source: FlashcardSource = FlashcardSource.manual


class FlashcardCreate(FlashcardBase):
    module_id: int


class FlashcardUpdate(BaseModel):
    """Edits a card's text or Submodule; its SM-2 scheduling and review history are untouched."""

    front: str | None = Field(default=None, pattern=r"\S")
    back: str | None = Field(default=None, pattern=r"\S")
    # Null moves the card to the whole Module.
    submodule_id: int | None = None


class FlashcardRead(FlashcardBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    ease_factor: float
    interval_days: int
    repetitions: int
    due_at: datetime
    last_reviewed_at: datetime | None


class FlashcardDue(FlashcardRead):
    """A due card plus the interval (days) each rating would give it next, keyed by quality."""

    next_intervals: dict[int, int]


class FlashcardReviewRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    quality: int
    reviewed_at: datetime


class FlashcardReviewCreate(BaseModel):
    """Grade of the last recall attempt, SM-2 scale 0-5 (>=3 counts as correct)."""

    quality: int = Field(ge=0, le=5)


class FlashcardGenerateRequest(BaseModel):
    count: int = Field(default=DEFAULT_CARD_COUNT, ge=1, le=MAX_CARD_COUNT)
    # Near-empty PDFs the student confirmed sending as the original file instead of their text.
    raw_pdf_ids: list[int] = []


class FlashcardProposal(BaseModel):
    front: str
    back: str


class FlashcardProposals(BaseModel):
    """Generated cards for review; nothing has been saved."""

    proposals: list[FlashcardProposal]
