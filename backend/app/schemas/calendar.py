from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class CalendarEvent(BaseModel):
    kind: Literal["lecture", "assignment_due"]
    id: int
    module_id: int
    title: str
    starts_at: datetime
    url: str
