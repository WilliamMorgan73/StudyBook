from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CalendarEvent(BaseModel):
    kind: Literal["lecture", "assignment_due", "exam", "busy"]
    """`busy` is one occurrence of a PersonalEvent: no module or link, and `id` is the
    PersonalEvent's, so it repeats across occurrences."""
    id: int
    module_id: int | None
    title: str
    starts_at: datetime
    ends_at: datetime | None = None
    location: str | None = None
    url: str | None
