from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.personal_event import PersonalEvent
from app.schemas.personal_event import (
    PersonalEventCreate,
    PersonalEventRead,
    PersonalEventUpdate,
)

router = APIRouter(prefix="/personal-events", tags=["personal-events"])


def _validate(event: PersonalEvent) -> None:
    """Normalizes `title`/`weekdays` in place and 422s on an unusable rule.

    Checked on the merged row so a PATCH can't leave the rule inconsistent.
    """
    event.title = (event.title or "").strip()
    if not event.title:
        raise HTTPException(422, "Title is required")
    if not event.weekdays:
        raise HTTPException(422, "Pick at least one weekday")
    if any(d not in range(7) for d in event.weekdays):
        raise HTTPException(422, "Weekdays must be 0 (Monday) to 6 (Sunday)")
    event.weekdays = sorted(set(event.weekdays))
    if event.start_time is None or event.end_time is None or event.valid_from is None:
        raise HTTPException(422, "Start time, end time and valid-from are required")
    if event.start_time == event.end_time:
        raise HTTPException(422, "End time must differ from start time")
    if event.valid_until is not None and event.valid_until < event.valid_from:
        raise HTTPException(422, "Valid-until can't be before valid-from")


@router.get("", response_model=list[PersonalEventRead])
def list_personal_events(db: Session = Depends(get_db)) -> list[PersonalEvent]:
    stmt = select(PersonalEvent).order_by(PersonalEvent.start_time, PersonalEvent.id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=PersonalEventRead, status_code=201)
def create_personal_event(payload: PersonalEventCreate, db: Session = Depends(get_db)) -> PersonalEvent:
    event = PersonalEvent(**payload.model_dump())
    _validate(event)
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=PersonalEventRead)
def update_personal_event(
    event_id: int, payload: PersonalEventUpdate, db: Session = Depends(get_db)
) -> PersonalEvent:
    event = db.get(PersonalEvent, event_id)
    if event is None:
        raise HTTPException(404, "Personal event not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, field, value)
    _validate(event)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}", status_code=204)
def delete_personal_event(event_id: int, db: Session = Depends(get_db)) -> None:
    event = db.get(PersonalEvent, event_id)
    if event is None:
        raise HTTPException(404, "Personal event not found")
    db.delete(event)
    db.commit()
