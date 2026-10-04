from datetime import UTC, datetime

from sqlalchemy import ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, deferred, mapped_column, relationship

from app.core.database import Base


class CalendarFeed(Base):
    """A subscribed ICS calendar (a Google Calendar secret address, or an uploaded timetable file).

    Parsed by `crud/calendar_feeds.py`. Event series linked to a Module (`CalendarFeedLink`) become
    that Module's Lectures; every other event is cached as a `CalendarFeedEvent` (busy time). A failed
    fetch keeps the last good copy of both.
    """

    __tablename__ = "calendar_feeds"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    # Secret: anyone with it can read the calendar. Never log it. None = an uploaded file.
    url: Mapped[str | None] = mapped_column(Text)
    # The last good ICS body (fetched or uploaded), so links can be re-applied without a fetch.
    source_text: Mapped[str | None] = deferred(mapped_column(Text))
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
    links: Mapped[list["CalendarFeedLink"]] = relationship(
        back_populates="feed", cascade="all, delete-orphan", passive_deletes=True
    )
    lectures: Mapped[list["Lecture"]] = relationship(  # noqa: F821
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


class CalendarFeedLink(Base):
    """Maps one event series of a feed (every event with this exact title) to a Module, whose
    Lectures those events then become."""

    __tablename__ = "calendar_feed_links"
    __table_args__ = (UniqueConstraint("feed_id", "title"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    feed_id: Mapped[int] = mapped_column(ForeignKey("calendar_feeds.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(Text)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))

    feed: Mapped[CalendarFeed] = relationship(back_populates="links")
