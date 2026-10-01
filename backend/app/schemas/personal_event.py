from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict


class PersonalEventBase(BaseModel):
    title: str
    weekdays: list[int]
    """0 = Monday ... 6 = Sunday."""
    start_time: time
    end_time: time
    """Before `start_time` = runs past midnight. Equal to it is rejected."""
    valid_from: date
    valid_until: date | None = None


class PersonalEventCreate(PersonalEventBase):
    pass


class PersonalEventUpdate(BaseModel):
    title: str | None = None
    weekdays: list[int] | None = None
    start_time: time | None = None
    end_time: time | None = None
    valid_from: date | None = None
    valid_until: date | None = None


class PersonalEventRead(PersonalEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
