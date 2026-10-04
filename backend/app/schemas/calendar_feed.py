from datetime import datetime

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
    url: str
    color: str
    enabled: bool
    last_synced_at: datetime | None
    """UTC. The last successful fetch; None until the first."""
    last_error: str | None
    """Why the latest fetch failed (the cached events are still used); None after a success."""
    event_count: int
    created_at: datetime

    @classmethod
    def from_row(cls, feed) -> "CalendarFeedRead":
        return cls.model_validate(
            {**{f: getattr(feed, f) for f in cls.model_fields if f != "event_count"}, "event_count": len(feed.events)}
        )


class CalendarFeedsRefreshed(BaseModel):
    refreshed: int
    """How many stale feeds were fetched successfully."""
