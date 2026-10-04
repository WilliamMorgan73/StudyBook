from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CalendarEvent(BaseModel):
    kind: Literal["lecture", "assignment_due", "exam", "busy", "revision"]
    """`busy` is busy time with no module or link: either one occurrence of a PersonalEvent (`id` is
    the PersonalEvent's, so it repeats across occurrences) or a cached CalendarFeedEvent (`feed_id`
    set, `id` is the CalendarFeedEvent's). `revision` is a RevisionSession; its
    `module_id` is its exam's."""
    id: int
    module_id: int | None
    title: str
    starts_at: datetime
    ends_at: datetime | None = None
    location: str | None = None
    url: str | None
    done: bool | None = None
    """Set only for `revision`."""
    feed_id: int | None = None
    """Set only for `busy` events from a calendar feed."""
    color: str | None = None
    """The calendar feed's colour; set only alongside `feed_id`."""
    all_day: bool = False
    """Only feed events can be all-day; they show on the calendar but never block revision planning."""
