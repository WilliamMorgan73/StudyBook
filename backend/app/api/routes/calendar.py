from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.busy_time import BusyOccurrence, expand_personal_events
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind
from app.models.lecture import Lecture
from app.models.personal_event import PersonalEvent
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


def _busy_event(occ: BusyOccurrence) -> CalendarEvent:
    return CalendarEvent(
        kind="busy",
        id=occ.event_id,
        module_id=None,
        title=occ.title,
        starts_at=occ.starts_at,
        ends_at=occ.ends_at,
        url=None,
    )


@router.get("", response_model=list[CalendarEvent])
def get_calendar(start: datetime, end: datetime, db: Session = Depends(get_db)) -> list[CalendarEvent]:
    lectures = db.scalars(
        select(Lecture).where(Lecture.scheduled_at >= start, Lecture.scheduled_at <= end)
    ).all()
    assignments = db.scalars(
        select(Assignment).where(Assignment.due_at >= start, Assignment.due_at <= end)
    ).all()
    # Coarse prefilter; expand_personal_events does the exact range check (incl. overnight spill).
    personal_events = db.scalars(
        select(PersonalEvent).where(
            PersonalEvent.valid_from <= end.date(),
            or_(PersonalEvent.valid_until.is_(None), PersonalEvent.valid_until >= start.date() - timedelta(days=1)),
        )
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
    ] + [
        _busy_event(occ)
        for occ in expand_personal_events(personal_events, start, end)
    ]
    return sorted(events, key=lambda e: e.starts_at)
