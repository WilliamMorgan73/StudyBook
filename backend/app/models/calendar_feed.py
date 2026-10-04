from datetime import UTC, datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CalendarFeed(Base):
    """A subscribed ICS calendar (e.g. a Google Calendar secret address) that counts as busy time.

    Fetched and parsed by `crud/calendar_feeds.py`; the parsed events are cached as
    `CalendarFeedEvent` rows so a failed fetch keeps the last good copy.
    """

    __tablename__ = "calendar_feeds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Secret: anyone with it can read the calendar. Never log it.
    url: Mapped[str] = mapped_column(Text)
    color: Mapped[str] = mapped_column(String(20))
    enabled: Mapped[bool] = mapped_column(default=True, server_default="true")
    # UTC, naive. Time of the last *successful* fetch; None until the first one.
    last_synced_at: Mapped[datetime | None]
    # Why the latest fetch failed; cleared on success.
    last_error: Mapped[str | None] = mapped_column(Text)
    # The Python default also covers inserts on databases without `now()` (the SQLite endpoint tests).
    created_at: Mapped[datetime] = mapped_column(
        default=lambda: datetime.now(UTC).replace(tzinfo=None), server_default="now()"
    )

    events: Mapped[list["CalendarFeedEvent"]] = relationship(
        back_populates="feed", cascade="all, delete-orphan", passive_deletes=True
    )


class CalendarFeedEvent(Base):
    """One cached occurrence from a CalendarFeed, recurrences already expanded."""

    __tablename__ = "calendar_feed_events"
    __table_args__ = (Index("ix_calendar_feed_events_feed_id_starts_at", "feed_id", "starts_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    feed_id: Mapped[int] = mapped_column(ForeignKey("calendar_feeds.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    # Local wall-clock, naive, like every student-facing datetime.
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    # Shown on the calendar but never blocks revision planning.
    all_day: Mapped[bool] = mapped_column(default=False)

    feed: Mapped[CalendarFeed] = relationship(back_populates="events")
