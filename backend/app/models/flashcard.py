from datetime import datetime

from sqlalchemy import ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Flashcard(Base):
    """SM-2 style spaced repetition state (ease_factor/interval_days/repetitions)."""

    __tablename__ = "flashcards"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    submodule_id: Mapped[int | None] = mapped_column(ForeignKey("submodules.id", ondelete="SET NULL"))
    front: Mapped[str]
    back: Mapped[str]
    ease_factor: Mapped[float] = mapped_column(Numeric(4, 2), default=2.5)
    interval_days: Mapped[int] = mapped_column(default=0)
    repetitions: Mapped[int] = mapped_column(default=0)
    due_at: Mapped[datetime] = mapped_column(server_default="now()")
    last_reviewed_at: Mapped[datetime | None]

    module: Mapped["Module"] = relationship(back_populates="flashcards")  # noqa: F821
    submodule: Mapped["Submodule | None"] = relationship(back_populates="flashcards")  # noqa: F821
    reviews: Mapped[list["FlashcardReview"]] = relationship(
        back_populates="flashcard", cascade="all, delete-orphan", passive_deletes=True
    )


class FlashcardReview(Base):
    """One recall attempt on a Flashcard: an append-only log, so review history survives rescheduling."""

    __tablename__ = "flashcard_reviews"

    id: Mapped[int] = mapped_column(primary_key=True)
    flashcard_id: Mapped[int] = mapped_column(ForeignKey("flashcards.id", ondelete="CASCADE"), index=True)
    quality: Mapped[int]
    reviewed_at: Mapped[datetime]

    flashcard: Mapped["Flashcard"] = relationship(back_populates="reviews")
