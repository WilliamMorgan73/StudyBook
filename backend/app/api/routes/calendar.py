from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.lecture import Lecture
from app.schemas.calendar import CalendarEvent

router = APIRouter(prefix="/calendar", tags=["calendar"])


@router.get("", response_model=list[CalendarEvent])
def get_calendar(start: datetime, end: datetime, db: Session = Depends(get_db)) -> list[CalendarEvent]:
    lectures = db.scalars(
        select(Lecture).where(Lecture.scheduled_at >= start, Lecture.scheduled_at <= end)
    ).all()
    assignments = db.scalars(
        select(Assignment).where(Assignment.due_at >= start, Assignment.due_at <= end)
    ).all()

    events = [
        CalendarEvent(
            kind="lecture",
            id=lec.id,
            module_id=lec.module_id,
            title=lec.title,
            starts_at=lec.scheduled_at,
            ends_at=lec.scheduled_at + timedelta(minutes=lec.duration_minutes)
            if lec.duration_minutes
            else None,
            location=lec.location,
            url=f"/modules/{lec.module_id}",
        )
        for lec in lectures
    ] + [
        CalendarEvent(
            kind="assignment_due",
            id=a.id,
            module_id=a.module_id,
            title=a.title,
            starts_at=a.due_at,
            url=f"/modules/{a.module_id}/assignments/{a.id}",
        )
        for a in assignments
        if a.due_at is not None
    ]
    return sorted(events, key=lambda e: e.starts_at)
