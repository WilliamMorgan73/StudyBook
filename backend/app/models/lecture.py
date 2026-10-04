from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


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
