from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.api.routes.calendar import _assignment_event
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind

# Stored datetimes are naive, matching the DB columns.
START = datetime(2026, 6, 1, 9, 0, tzinfo=UTC).replace(tzinfo=None)


def make_assignment(kind: AssignmentKind, duration_minutes: int | None = None, location: str | None = None):
    return Assignment(
        id=7,
        module_id=3,
        title="Finals",
        due_at=START,
        kind=kind,
        duration_minutes=duration_minutes,
        location=location,
    )


def test_exam_event_carries_end_time_and_location():
    event = _assignment_event(make_assignment(AssignmentKind.exam, duration_minutes=120, location="Sports Hall"))

    assert event.kind == "exam"
    assert event.starts_at == START
    assert event.ends_at == START + timedelta(hours=2)
    assert event.location == "Sports Hall"
    assert event.url == "/modules/3/assignments/7"


def test_exam_without_duration_has_no_end_time():
    event = _assignment_event(make_assignment(AssignmentKind.exam))

    assert event.kind == "exam"
    assert event.ends_at is None


def test_coursework_event_ignores_stale_exam_fields():
    event = _assignment_event(make_assignment(AssignmentKind.coursework, duration_minutes=120, location="Hall"))

    assert event.kind == "assignment_due"
    assert event.ends_at is None
    assert event.location is None
