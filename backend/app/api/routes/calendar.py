from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind
from app.models.lecture import Lecture
from app.schemas.calendar import CalendarEvent

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _ends_at(starts_at: datetime, duration_minutes: int | None) -> datetime | None:
    return starts_at + timedelta(minutes=duration_minutes) if duration_minutes else None


def _assignment_event(a: Assignment) -> CalendarEvent:
    is_exam = a.kind == AssignmentKind.exam
    return CalendarEvent(
        kind="exam" if is_exam else "assignment_due",
        id=a.id,
        module_id=a.module_id,
        title=a.title,
        starts_at=a.due_at,
        ends_at=_ends_at(a.due_at, a.duration_minutes) if is_exam else None,
        location=a.location if is_exam else None,
        url=f"/modules/{a.module_id}/assignments/{a.id}",
    )


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
            ends_at=_ends_at(lec.scheduled_at, lec.duration_minutes),
            location=lec.location,
            url=f"/modules/{lec.module_id}",
        )
        for lec in lectures
    ] + [
        _assignment_event(a)
        for a in assignments
        if a.due_at is not None
    ]
    return sorted(events, key=lambda e: e.starts_at)
