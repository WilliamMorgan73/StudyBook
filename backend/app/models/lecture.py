from datetime import datetime

from sqlalchemy import Column, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Which Submodules a Lecture covered, set per occurrence (also on feed Lectures: the feed never touches it,
# except that moving a Lecture to another Module clears it). Rows go with either side.
lecture_submodules = Table(
    "lecture_submodules",
    Base.metadata,
    Column("lecture_id", ForeignKey("lectures.id", ondelete="CASCADE"), primary_key=True),
    Column("submodule_id", ForeignKey("submodules.id", ondelete="CASCADE"), primary_key=True),
)


class Lecture(Base):
    __tablename__ = "lectures"
    __table_args__ = (UniqueConstraint("feed_id", "feed_uid"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    scheduled_at: Mapped[datetime]
    duration_minutes: Mapped[int | None]
    location: Mapped[str | None] = mapped_column(String(200))
    week_number: Mapped[int | None]
    # Set for Lectures synced from a calendar feed's linked series (read-only; the feed owns them).
    feed_id: Mapped[int | None] = mapped_column(ForeignKey("calendar_feeds.id", ondelete="CASCADE"), index=True)
    # The occurrence's identity in the feed (UID + original start), stable across re-uploads.
    feed_uid: Mapped[str | None] = mapped_column(String(500))

    module: Mapped["Module"] = relationship(back_populates="lectures")  # noqa: F821
    feed: Mapped["CalendarFeed | None"] = relationship(back_populates="lectures")  # noqa: F821
    submodules: Mapped[list["Submodule"]] = relationship(  # noqa: F821
        # Every read of a Lecture returns them, so load them in one query per batch, not one per Lecture.
        secondary=lecture_submodules, order_by="Submodule.title", passive_deletes=True, lazy="selectin"
    )
