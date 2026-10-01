from datetime import UTC, date, datetime, time, timedelta

import pytest
from fastapi import HTTPException

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.api.routes.calendar import _busy_event
from app.api.routes.personal_events import _validate
from app.crud.busy_time import busy_intervals, expand_personal_events, merge_intervals
from app.models.personal_event import PersonalEvent

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)


def dt(*args: int) -> datetime:
    """A naive datetime, matching the DB columns."""
    return datetime(*args, tzinfo=UTC).replace(tzinfo=None)


def make_event(
    weekdays: list[int],
    start: time = time(9, 0),
    end: time = time(17, 0),
    valid_from: date = date(2026, 1, 1),
    valid_until: date | None = None,
    id: int = 1,
    title: str = "Work",
) -> PersonalEvent:
    return PersonalEvent(
        id=id,
        title=title,
        weekdays=weekdays,
        start_time=start,
        end_time=end,
        valid_from=valid_from,
        valid_until=valid_until,
    )


def starts(occurrences):
    return [o.starts_at for o in occurrences]


# 2026-06-01 is a Monday.
WEEK_START = dt(2026, 6, 1)
WEEK_END = dt(2026, 6, 8)


def test_multiple_weekdays_expand_to_one_occurrence_each():
    occ = expand_personal_events([make_event([MON, WED, FRI])], WEEK_START, WEEK_END)

    assert starts(occ) == [dt(2026, 6, 1, 9), dt(2026, 6, 3, 9), dt(2026, 6, 5, 9)]
    assert all(o.ends_at - o.starts_at == timedelta(hours=8) for o in occ)
    assert {o.title for o in occ} == {"Work"}


def test_valid_from_and_until_are_inclusive():
    event = make_event([MON, TUE, WED, THU, FRI], valid_from=date(2026, 6, 2), valid_until=date(2026, 6, 4))

    occ = expand_personal_events([event], WEEK_START, WEEK_END)

    assert [o.starts_at.date() for o in occ] == [date(2026, 6, 2), date(2026, 6, 3), date(2026, 6, 4)]


def test_open_ended_rule_keeps_recurring_far_into_the_future():
    event = make_event([SAT], valid_from=date(2020, 1, 1), valid_until=None)

    occ = expand_personal_events([event], dt(2031, 3, 1), dt(2031, 3, 31))

    assert [o.starts_at.date() for o in occ] == [date(2031, 3, d) for d in (1, 8, 15, 22, 29)]


def test_rule_not_yet_valid_or_expired_yields_nothing():
    future = make_event([MON], valid_from=date(2027, 1, 1))
    past = make_event([MON], valid_from=date(2025, 1, 1), valid_until=date(2025, 12, 31))

    assert expand_personal_events([future, past], WEEK_START, WEEK_END) == []


def test_range_is_half_open_and_partial_overlaps_count():
    event = make_event([MON, TUE], start=time(9), end=time(17))

    # Starting mid-Monday-shift still includes it, unclipped; ending exactly at Tuesday 09:00 excludes Tuesday.
    occ = expand_personal_events([event], dt(2026, 6, 1, 12), dt(2026, 6, 2, 9))

    assert starts(occ) == [dt(2026, 6, 1, 9)]


def test_overnight_event_ends_next_day_and_is_found_from_the_previous_evening():
    night = make_event([SUN], start=time(22), end=time(6))

    occ = expand_personal_events([night], WEEK_START, WEEK_END)

    # Sunday 31 May 22:00 spills into Monday 1 June; Sunday 7 June starts inside the range.
    assert [(o.starts_at, o.ends_at) for o in occ] == [
        (dt(2026, 5, 31, 22), dt(2026, 6, 1, 6)),
        (dt(2026, 6, 7, 22), dt(2026, 6, 8, 6)),
    ]


def test_occurrences_from_several_events_are_sorted():
    gym = make_event([MON], start=time(7), end=time(8), id=2, title="Gym")
    work = make_event([MON], start=time(9), end=time(17), id=1)

    occ = expand_personal_events([work, gym], WEEK_START, dt(2026, 6, 2))

    assert [o.title for o in occ] == ["Gym", "Work"]


def test_empty_or_inverted_range_yields_nothing():
    assert expand_personal_events([make_event([MON])], WEEK_END, WEEK_START) == []


def test_merge_joins_overlapping_and_touching_intervals():
    a = dt(2026, 6, 1, 9)
    h = lambda n: a.replace(hour=n)

    assert merge_intervals([(h(14), h(16)), (h(9), h(12)), (h(11), h(13)), (h(13), h(14)), (h(18), h(19))]) == [
        (h(9), h(16)),
        (h(18), h(19)),
    ]


def test_busy_intervals_are_merged_and_clipped_to_the_range():
    work = make_event([MON], start=time(9), end=time(17), id=1)
    meeting = make_event([MON], start=time(16), end=time(18), id=2)

    intervals = busy_intervals([work, meeting], dt(2026, 6, 1, 12), dt(2026, 6, 2))

    assert intervals == [(dt(2026, 6, 1, 12), dt(2026, 6, 1, 18))]


def test_busy_calendar_event_has_no_module_or_link():
    [occ] = expand_personal_events([make_event([MON], id=4)], WEEK_START, dt(2026, 6, 2))

    event = _busy_event(occ)

    assert event.kind == "busy"
    assert event.id == 4
    assert event.module_id is None
    assert event.url is None
    assert (event.starts_at, event.ends_at) == (dt(2026, 6, 1, 9), dt(2026, 6, 1, 17))


def test_validate_normalizes_weekdays_and_title():
    event = make_event([FRI, MON, FRI], title="  Shift  ")

    _validate(event)

    assert event.weekdays == [MON, FRI]
    assert event.title == "Shift"


@pytest.mark.parametrize(
    "event",
    [
        make_event([]),
        make_event([7]),
        make_event([MON], title="  "),
        make_event([MON], start=time(9), end=time(9)),
        make_event([MON], valid_from=date(2026, 6, 2), valid_until=date(2026, 6, 1)),
    ],
)
def test_validate_rejects_unusable_rules(event):
    with pytest.raises(HTTPException) as exc:
        _validate(event)
    assert exc.value.status_code == 422
