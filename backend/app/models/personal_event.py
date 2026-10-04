from datetime import date, datetime, time

from sqlalchemy import JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class PersonalEvent(Base):
    """A recurring personal commitment (work shift, training) that counts as busy time.

    Unlike `Lecture`, this stores the weekly rule rather than one row per occurrence;
    `crud/busy_time.py` expands it into concrete intervals on read.
    """

    __tablename__ = "personal_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    # Python `date.weekday()` numbering: 0 = Monday ... 6 = Sunday; a JSON list.
    weekdays: Mapped[list[int]] = mapped_column(JSON)
    # Naive wall-clock times, like every other stored datetime. An end before the start means
    # the event runs past midnight into the next day.
    start_time: Mapped[time]
    end_time: Mapped[time]
    valid_from: Mapped[date]
    # Inclusive; None = open-ended.
    valid_until: Mapped[date | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
