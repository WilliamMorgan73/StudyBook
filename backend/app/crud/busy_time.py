"""Busy-time expansion: recurring PersonalEvent rules -> concrete busy intervals.

Pure functions over (possibly unsaved) model instances; no DB access. All datetimes are naive
wall-clock times, matching the DB columns.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.models.personal_event import PersonalEvent


@dataclass(frozen=True)
class BusyOccurrence:
    """One concrete occurrence of a PersonalEvent."""

    event_id: int
    title: str
    starts_at: datetime
    ends_at: datetime


def _occurrence_on(event: PersonalEvent, day: date) -> BusyOccurrence | None:
    if day < event.valid_from or (event.valid_until is not None and day > event.valid_until):
        return None
    if day.weekday() not in event.weekdays:
        return None
    starts_at = datetime.combine(day, event.start_time)
    ends_at = datetime.combine(day, event.end_time)
    if ends_at <= starts_at:  # runs past midnight
        ends_at += timedelta(days=1)
    return BusyOccurrence(event_id=event.id, title=event.title, starts_at=starts_at, ends_at=ends_at)


def expand_personal_events(
    events: Iterable[PersonalEvent], start: datetime, end: datetime
) -> list[BusyOccurrence]:
    """Every occurrence that overlaps [start, end), sorted by start time.

    Occurrences aren't clipped, so one that began before `start` keeps its real start time.
    `valid_from`/`valid_until` are inclusive and bound the day an occurrence *starts* on;
    an open-ended rule (`valid_until=None`) is bounded only by the range.
    """
    if end <= start:
        return []
    events = list(events)
    occurrences: list[BusyOccurrence] = []
    # Start a day early so an overnight occurrence from the previous evening is caught.
    day = start.date() - timedelta(days=1)
    while day <= end.date():
        for event in events:
            occ = _occurrence_on(event, day)
            if occ is not None and occ.ends_at > start and occ.starts_at < end:
                occurrences.append(occ)
        day += timedelta(days=1)
    return sorted(occurrences, key=lambda o: (o.starts_at, o.ends_at, o.event_id))


def merge_intervals(intervals: Iterable[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    """Sorted, non-overlapping intervals; overlapping or touching ones are joined."""
    merged: list[tuple[datetime, datetime]] = []
    for s, e in sorted(intervals):
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def busy_intervals(
    events: Sequence[PersonalEvent], start: datetime, end: datetime
) -> list[tuple[datetime, datetime]]:
    """The merged busy intervals within [start, end), clipped to the range."""
    return merge_intervals(
        (max(o.starts_at, start), min(o.ends_at, end)) for o in expand_personal_events(events, start, end)
    )
