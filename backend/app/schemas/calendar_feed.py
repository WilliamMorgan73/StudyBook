from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class CalendarFeedCreate(BaseModel):
    name: str
    url: str
    """An http(s) or webcal ICS address, e.g. Google Calendar's "Secret address in iCal format"."""
    color: str
    enabled: bool = True


class CalendarFeedUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    color: str | None = None
    enabled: bool | None = None


class CalendarFeedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    url: str | None
    """None for an uploaded file."""
    source: Literal["url", "file"]
    color: str
    enabled: bool
    last_synced_at: datetime | None
    """UTC. The last successful fetch; None until the first."""
    last_error: str | None
    """Why the latest fetch failed (the cached events are still used); None after a success."""
    event_count: int
    """Cached busy events (series not linked to a Module)."""
    linked_lecture_count: int
    created_at: datetime

    @classmethod
    def from_row(cls, feed) -> "CalendarFeedRead":
        computed = {
            "source": "file" if feed.url is None else "url",
            "event_count": len(feed.events),
            "linked_lecture_count": len(feed.lectures),
        }
        return cls.model_validate({**{f: getattr(feed, f) for f in cls.model_fields if f not in computed}, **computed})


class CalendarFeedsRefreshed(BaseModel):
    refreshed: int
    """How many stale feeds were fetched successfully."""


class FeedSeriesRead(BaseModel):
    """One event series in a feed: every timed event with this exact title."""

    title: str
    count: int
    first_starts_at: datetime
    location: str | None
    module_id: int | None
    """The Module this series is linked to (its events are that Module's Lectures), or None (busy time)."""


class FeedLinkItem(BaseModel):
    title: str
    module_id: int | None
    """None unlinks the series, turning its Lectures back into busy time."""
