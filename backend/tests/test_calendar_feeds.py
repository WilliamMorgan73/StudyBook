"""ICS feed parsing and refreshing, from text fixtures in `tests/fixtures/ics/` (never the network)."""

import time as time_module
from collections.abc import Iterator
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import ARRAY, create_engine, select
from sqlalchemy import event as sa_event
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.core.clock import local_now
from app.core.database import Base, get_db
from app.crud import calendar_feeds
from app.crud.calendar_feeds import (
    FeedFetchError,
    FeedParseError,
    feed_events_between,
    normalize_feed_url,
    parse_feed,
    refresh_feed,
    refresh_stale_feeds,
)
from app.main import app as fastapi_app
from app.models import CalendarFeed, CalendarFeedEvent, Lecture, Module, Submodule

FIXTURES = Path(__file__).parent / "fixtures" / "ics"


def dt(*args: int) -> datetime:
    """A naive datetime, matching the DB columns."""
    return datetime(*args, tzinfo=UTC).replace(tzinfo=None)


WINDOW = (dt(2026, 5, 1), dt(2026, 12, 31))


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text()


def parse(name: str):
    return parse_feed(fixture(name), *WINDOW)


@pytest.fixture
def new_york_time(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """Pins the server's local timezone, which aware feed times are converted into."""
    monkeypatch.setenv("TZ", "America/New_York")
    time_module.tzset()
    yield
    monkeypatch.undo()
    time_module.tzset()


# --- parse_feed -----------------------------------------------------------------------------------


def test_weekly_rule_is_expanded_with_exdate_and_moved_override():
    occurrences = parse("recurring.ics")

    assert [(o.title, o.starts_at, o.ends_at) for o in occurrences] == [
        ("Shift", dt(2026, 6, 1, 9), dt(2026, 6, 1, 13)),
        # 8 June is excluded by EXDATE; 15 June was moved to the 16th by a RECURRENCE-ID override.
        ("Shift (moved)", dt(2026, 6, 16, 14), dt(2026, 6, 16, 18)),
        ("Shift", dt(2026, 6, 22, 9), dt(2026, 6, 22, 13)),
    ]
    assert not any(o.all_day for o in occurrences)


def test_window_bounds_the_expansion():
    occurrences = parse_feed(fixture("recurring.ics"), dt(2026, 6, 10), dt(2026, 6, 20))

    assert [o.starts_at for o in occurrences] == [dt(2026, 6, 16, 14)]


def test_all_day_events_run_midnight_to_midnight_one_per_day():
    occurrences = parse("all_day.ics")

    assert [(o.title, o.starts_at, o.ends_at, o.all_day) for o in occurrences] == [
        ("Bank holiday", dt(2026, 6, 1), dt(2026, 6, 2), True),
        # DTEND is exclusive: the 3rd to the 6th is three days.
        ("Field trip", dt(2026, 6, 3), dt(2026, 6, 4), True),
        ("Field trip", dt(2026, 6, 4), dt(2026, 6, 5), True),
        ("Field trip", dt(2026, 6, 5), dt(2026, 6, 6), True),
    ]


def test_free_and_cancelled_events_are_skipped_and_untitled_ones_named():
    occurrences = parse("free_cancelled.ics")

    assert [(o.title, o.starts_at, o.ends_at) for o in occurrences] == [
        ("Dentist", dt(2026, 6, 1, 15), dt(2026, 6, 1, 15, 30)),  # DURATION, no DTEND
        ("Busy", dt(2026, 6, 1, 17), dt(2026, 6, 1, 18)),
    ]


@pytest.mark.usefixtures("new_york_time")
def test_aware_times_become_local_naive_across_dst_changes():
    occurrences = parse("timezones.ics")

    assert [(o.title, o.starts_at, o.ends_at) for o in occurrences] == [
        ("Call", dt(2026, 6, 1, 8), dt(2026, 6, 1, 9)),  # 12:00Z = 08:00 EDT
        ("Training", dt(2026, 10, 20, 13), dt(2026, 10, 20, 14)),  # 18:00 BST = 13:00 EDT
        # London left summer time on 25 October, New York not until 1 November.
        ("Training", dt(2026, 10, 27, 14), dt(2026, 10, 27, 15)),
    ]
    assert all(o.starts_at.tzinfo is None and o.ends_at.tzinfo is None for o in occurrences)


def test_empty_calendar_has_no_events():
    assert parse("empty.ics") == []


@pytest.mark.parametrize("text", ["", "hello", fixture("not_a_calendar.html")])
def test_non_calendar_text_is_a_parse_error(text):
    with pytest.raises(FeedParseError):
        parse_feed(text, *WINDOW)


# --- normalize_feed_url ---------------------------------------------------------------------------


def test_webcal_becomes_https_and_whitespace_is_trimmed():
    assert normalize_feed_url("  webcal://example.com/basic.ics ") == "https://example.com/basic.ics"
    assert normalize_feed_url("https://example.com/a.ics") == "https://example.com/a.ics"


@pytest.mark.parametrize("url", ["", "example.com/a.ics", "ftp://example.com/a.ics", "file:///etc/passwd", "https://"])
def test_non_http_urls_are_rejected(url):
    with pytest.raises(ValueError):
        normalize_feed_url(url)


# --- refreshing and the cache (in-memory SQLite, fake fetch) --------------------------------------


def ics(*events: tuple[str, datetime, datetime] | tuple[str, date]) -> str:
    """A minimal calendar: (title, start, end) timed events (floating local times), or (title, day) all-day ones."""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//StudyBook tests//EN"]
    for i, event in enumerate(events):
        lines += ["BEGIN:VEVENT", f"UID:{i}@test", f"SUMMARY:{event[0]}"]
        if len(event) == 2:
            lines.append(f"DTSTART;VALUE=DATE:{event[1]:%Y%m%d}")
        else:
            lines += [f"DTSTART:{event[1]:%Y%m%dT%H%M%S}", f"DTEND:{event[2]:%Y%m%dT%H%M%S}"]
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def failing_fetch(_url: str) -> str:
    raise FeedFetchError("Couldn't reach the calendar (offline?)")


@compiles(ARRAY, "sqlite")
def _array_as_json(_type, _compiler, **_kw) -> str:
    # SQLite has no arrays; only `personal_events.weekdays` uses one, and these tests never write it.
    return "JSON"


@pytest.fixture
def db() -> Iterator[Session]:
    """A throwaway in-memory SQLite database (never the dev Postgres), with foreign keys enforced so
    ON DELETE CASCADE works as in Postgres. Every table, since `GET /calendar` reads them all."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    sa_event.listen(engine, "connect", lambda conn, _record: conn.execute("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    yield session
    session.close()


def make_feed(db: Session, *, enabled: bool = True, last_synced_at: datetime | None = None) -> CalendarFeed:
    feed = CalendarFeed(
        name="Work", url="https://example.com/work.ics", color="#3b82f6", enabled=enabled, last_synced_at=last_synced_at
    )
    db.add(feed)
    db.commit()
    return feed


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


SHIFT = ("Shift", dt(2026, 6, 2, 9), dt(2026, 6, 2, 13))


def test_successful_refresh_replaces_the_cached_events(db):
    feed = make_feed(db)
    assert refresh_feed(feed, lambda _url: ics(SHIFT, ("Holiday", date(2026, 6, 3))), now=dt(2026, 6, 1))
    db.commit()

    assert refresh_feed(feed, lambda _url: ics(("Gym", dt(2026, 6, 4, 18), dt(2026, 6, 4, 19))), now=dt(2026, 6, 1))
    db.commit()

    rows = db.scalars(select(CalendarFeedEvent)).all()
    assert [(e.title, e.starts_at, e.all_day) for e in rows] == [("Gym", dt(2026, 6, 4, 18), False)]
    assert feed.last_synced_at is not None and feed.last_error is None


def test_failed_fetch_keeps_the_last_good_copy(db):
    feed = make_feed(db)
    refresh_feed(feed, lambda _url: ics(SHIFT), now=dt(2026, 6, 1))
    db.commit()
    synced_at = feed.last_synced_at

    assert not refresh_feed(feed, failing_fetch, now=dt(2026, 6, 1))
    db.commit()

    assert [e.title for e in db.scalars(select(CalendarFeedEvent))] == ["Shift"]
    assert feed.last_synced_at == synced_at
    assert feed.last_error == "Couldn't reach the calendar (offline?)"


def test_unparseable_reply_keeps_the_last_good_copy_and_never_mentions_the_url(db):
    feed = make_feed(db)
    refresh_feed(feed, lambda _url: ics(SHIFT), now=dt(2026, 6, 1))

    assert not refresh_feed(feed, lambda _url: fixture("not_a_calendar.html"), now=dt(2026, 6, 1))

    assert len(feed.events) == 1
    assert feed.last_error and "example.com" not in feed.last_error


def test_only_stale_enabled_feeds_are_refreshed(db):
    never = make_feed(db)
    stale = make_feed(db, last_synced_at=utc_now() - timedelta(hours=2))
    fresh = make_feed(db, last_synced_at=utc_now() - timedelta(minutes=5))
    disabled = make_feed(db, enabled=False)
    fetched: list[int] = []

    def fetch(_url: str) -> str:
        fetched.append(1)
        return ics()

    assert refresh_stale_feeds(db, fetch) == 2
    assert len(fetched) == 2
    assert never.last_synced_at is not None and stale.last_synced_at > utc_now() - timedelta(minutes=1)
    assert fresh.last_synced_at < utc_now() - timedelta(minutes=4)
    assert disabled.last_synced_at is None


def test_feed_events_between_skips_disabled_feeds_and_optionally_all_day(db):
    on, off = make_feed(db), make_feed(db, enabled=False)
    for feed in (on, off):
        refresh_feed(feed, lambda _url: ics(SHIFT, ("Holiday", date(2026, 6, 2))), now=dt(2026, 6, 1))
    db.commit()
    day = (dt(2026, 6, 2), dt(2026, 6, 3))

    assert [(e.title, e.feed_id) for e in feed_events_between(db, *day)] == [("Holiday", on.id), ("Shift", on.id)]
    assert [e.title for e in feed_events_between(db, *day, include_all_day=False)] == ["Shift"]
    assert feed_events_between(db, dt(2026, 6, 2, 13), dt(2026, 6, 2, 14), include_all_day=False) == []


# --- endpoints ------------------------------------------------------------------------------------


@pytest.fixture
def client(db: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    # Tomorrow, relative to the real clock, so it falls inside the cache window.
    tomorrow = local_now().date() + timedelta(days=1)
    reply = ics(("Shift", datetime.combine(tomorrow, time(9)), datetime.combine(tomorrow, time(13))))
    monkeypatch.setattr(calendar_feeds, "fetch_ics", lambda _url: reply)
    fastapi_app.dependency_overrides[get_db] = lambda: db
    yield TestClient(fastapi_app)
    fastapi_app.dependency_overrides.clear()


FEED = {"name": " Work ", "url": "webcal://example.com/work.ics", "color": "#3b82f6"}


def test_creating_a_feed_normalizes_it_and_syncs_straight_away(client):
    response = client.post("/calendar-feeds", json=FEED)

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Work"
    assert body["url"] == "https://example.com/work.ics"
    assert body["enabled"] is True
    assert body["event_count"] == 1
    assert body["last_synced_at"] is not None and body["last_error"] is None


@pytest.mark.parametrize(
    "patch",
    [{"name": "  "}, {"url": "ftp://example.com/a.ics"}, {"color": "blue"}],
)
def test_invalid_feeds_are_rejected(client, patch):
    assert client.post("/calendar-feeds", json={**FEED, **patch}).status_code == 422


def test_a_failed_first_sync_still_saves_the_feed(client, monkeypatch):
    monkeypatch.setattr(calendar_feeds, "fetch_ics", failing_fetch)

    body = client.post("/calendar-feeds", json=FEED).json()

    assert body["event_count"] == 0
    assert body["last_synced_at"] is None
    assert body["last_error"] == "Couldn't reach the calendar (offline?)"


def test_changing_the_url_drops_the_old_events_and_resyncs(client, monkeypatch):
    feed_id = client.post("/calendar-feeds", json=FEED).json()["id"]
    monkeypatch.setattr(calendar_feeds, "fetch_ics", failing_fetch)

    body = client.patch(f"/calendar-feeds/{feed_id}", json={"url": "https://example.com/other.ics"}).json()

    assert body["event_count"] == 0
    assert body["last_synced_at"] is None and body["last_error"]


def test_disabling_a_feed_hides_its_events_from_the_calendar(client):
    feed_id = client.post("/calendar-feeds", json=FEED).json()["id"]
    now = local_now()
    params = {"start": now.isoformat(), "end": (now + timedelta(days=3)).isoformat()}

    [event] = client.get("/calendar", params=params).json()
    assert event["kind"] == "busy"
    assert event["feed_id"] == feed_id
    assert event["color"] == "#3b82f6"
    assert event["all_day"] is False
    assert event["url"] is None

    client.patch(f"/calendar-feeds/{feed_id}", json={"enabled": False})
    assert client.get("/calendar", params=params).json() == []


def test_manual_refresh_reports_the_error_but_keeps_events(client, monkeypatch):
    feed_id = client.post("/calendar-feeds", json=FEED).json()["id"]
    monkeypatch.setattr(calendar_feeds, "fetch_ics", failing_fetch)

    response = client.post(f"/calendar-feeds/{feed_id}/refresh")

    assert response.status_code == 200
    assert response.json()["event_count"] == 1
    assert response.json()["last_error"]


def test_refresh_stale_skips_feeds_synced_just_now(client):
    client.post("/calendar-feeds", json=FEED)

    assert client.post("/calendar-feeds/refresh-stale").json() == {"refreshed": 0}


def test_deleting_a_feed_deletes_its_events(client, db):
    feed_id = client.post("/calendar-feeds", json=FEED).json()["id"]

    assert client.delete(f"/calendar-feeds/{feed_id}").status_code == 204
    assert client.get("/calendar-feeds").json() == []
    assert db.scalars(select(CalendarFeedEvent)).all() == []


# --- uploaded timetables and linking series to Lectures -------------------------------------------

# Next Monday at the earliest, so every lecture sits inside the cache window.
_today = local_now().date()
WEEK1 = _today + timedelta(days=7 - _today.weekday())


def at(week: int, hour: int, weekday: int = 0) -> datetime:
    return datetime.combine(WEEK1 + timedelta(weeks=week - 1, days=weekday), time(hour))


def timetable(*, exdates: tuple[int, ...] = (2,), moved_week: int | None = None) -> str:
    """A university-style export: a weekly lecture (Mon 10:00, 4 weeks, `exdates` weeks skipped,
    optionally `moved_week` moved to Wednesday 14:00) and two one-off labs (Thu 13:00)."""
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//University//Timetable//EN"]
    lines += [
        "BEGIN:VEVENT",
        "UID:comp3001-lecture@uni",
        "SUMMARY:COMP3001 Lecture",
        "LOCATION:Main Hall  101",
        f"DTSTART:{at(1, 10):%Y%m%dT%H%M%S}",
        f"DTEND:{at(1, 11):%Y%m%dT%H%M%S}",
        "RRULE:FREQ=WEEKLY;COUNT=4",
        *(f"EXDATE:{at(w, 10):%Y%m%dT%H%M%S}" for w in exdates),
        "END:VEVENT",
    ]
    if moved_week is not None:
        lines += [
            "BEGIN:VEVENT",
            "UID:comp3001-lecture@uni",
            f"RECURRENCE-ID:{at(moved_week, 10):%Y%m%dT%H%M%S}",
            "SUMMARY:COMP3001 Lecture",
            "LOCATION:Main Hall 101",
            f"DTSTART:{at(moved_week, 14, weekday=2):%Y%m%dT%H%M%S}",
            f"DTEND:{at(moved_week, 15, weekday=2):%Y%m%dT%H%M%S}",
            "END:VEVENT",
        ]
    for week in (1, 2):
        lines += [
            "BEGIN:VEVENT",
            f"UID:comp3001-lab-{week}@uni",
            "SUMMARY:COMP3001 Lab",
            "LOCATION:Lab B",
            f"DTSTART:{at(week, 13, weekday=3):%Y%m%dT%H%M%S}",
            f"DTEND:{at(week, 15, weekday=3):%Y%m%dT%H%M%S}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def upload(client, text: str, name: str = "Timetable"):
    return client.post(
        "/calendar-feeds/upload",
        data={"name": name, "color": "#14b8a6"},
        files={"file": ("timetable.ics", text.encode(), "text/calendar")},
    )


def make_module(db: Session) -> Module:
    module = Module(name="Algorithms", created_at=utc_now())
    db.add(module)
    db.commit()
    return module


def link(client, feed_id: int, module_id: int | None, title: str = "COMP3001 Lecture"):
    return client.put(f"/calendar-feeds/{feed_id}/links", json=[{"title": title, "module_id": module_id}])


def lectures(client, module_id: int) -> list[dict]:
    return client.get("/lectures", params={"module_id": module_id}).json()


def busy_titles(client) -> list[str]:
    params = {"start": at(1, 0).isoformat(), "end": at(5, 0).isoformat()}
    return sorted(e["title"] for e in client.get("/calendar", params=params).json() if e["kind"] == "busy")


def test_uploading_a_timetable_creates_a_file_feed(client):
    response = upload(client, timetable())

    assert response.status_code == 201
    body = response.json()
    assert body["source"] == "file" and body["url"] is None
    assert body["event_count"] == 5  # 3 lectures (week 2 skipped) + 2 labs, all busy until linked
    assert body["linked_lecture_count"] == 0
    assert body["last_synced_at"] is not None and body["last_error"] is None


def test_non_calendar_and_oversized_uploads_are_rejected(client):
    assert upload(client, fixture("not_a_calendar.html")).status_code == 422
    assert upload(client, "X" * (2 * 1024 * 1024 + 1)).status_code == 413
    assert client.get("/calendar-feeds").json() == []


def test_series_group_timed_events_by_title(client):
    feed_id = upload(client, timetable()).json()["id"]

    series = client.get(f"/calendar-feeds/{feed_id}/series").json()

    assert [(s["title"], s["count"], s["location"], s["module_id"]) for s in series] == [
        ("COMP3001 Lab", 2, "Lab B", None),
        ("COMP3001 Lecture", 3, "Main Hall 101", None),  # whitespace collapsed
    ]
    assert series[1]["first_starts_at"] == at(1, 10).isoformat()


def test_linking_a_series_turns_its_events_into_the_modules_lectures(client, db):
    module = make_module(db)
    feed_id = upload(client, timetable()).json()["id"]

    body = link(client, feed_id, module.id).json()

    assert body["linked_lecture_count"] == 3 and body["event_count"] == 2
    rows = lectures(client, module.id)
    assert [(lec["title"], lec["scheduled_at"], lec["duration_minutes"], lec["location"], lec["feed_id"]) for lec in rows] == [
        ("COMP3001 Lecture", at(week, 10).isoformat(), 60, "Main Hall 101", feed_id) for week in (1, 3, 4)
    ]
    # Linked events are Lectures now, not busy time as well.
    assert busy_titles(client) == ["COMP3001 Lab", "COMP3001 Lab"]
    assert client.get(f"/calendar-feeds/{feed_id}/series").json()[1]["module_id"] == module.id


def test_replacing_the_file_updates_linked_lectures_in_place(client, db):
    module = make_module(db)
    feed_id = upload(client, timetable()).json()["id"]
    link(client, feed_id, module.id)
    ids = {lec["scheduled_at"]: lec["id"] for lec in lectures(client, module.id)}
    # A lecture from long ago, outside the cache window: re-uploads must leave it alone.
    old = Lecture(module_id=module.id, feed_id=feed_id, feed_uid="comp3001-lecture@uni|old", title="COMP3001 Lecture",
                  scheduled_at=local_now() - timedelta(days=90))  # fmt: skip
    db.add(old)
    db.commit()

    # Week 1 cancelled, week 3 moved to Wednesday afternoon.
    response = client.put(
        f"/calendar-feeds/{feed_id}/file",
        files={"file": ("timetable.ics", timetable(exdates=(1, 2), moved_week=3).encode(), "text/calendar")},
    )

    assert response.status_code == 200
    rows = {lec["id"]: lec["scheduled_at"] for lec in lectures(client, module.id)}
    assert rows == {
        old.id: old.scheduled_at.isoformat(),
        ids[at(3, 10).isoformat()]: at(3, 14, weekday=2).isoformat(),  # same Lecture, moved
        ids[at(4, 10).isoformat()]: at(4, 10).isoformat(),
    }


def test_unlinking_turns_lectures_back_into_busy_time(client, db):
    module = make_module(db)
    feed_id = upload(client, timetable()).json()["id"]
    link(client, feed_id, module.id)

    body = link(client, feed_id, None).json()

    assert body["linked_lecture_count"] == 0 and body["event_count"] == 5
    assert lectures(client, module.id) == []
    assert busy_titles(client).count("COMP3001 Lecture") == 3


def test_linking_to_an_unknown_module_is_rejected(client):
    feed_id = upload(client, timetable()).json()["id"]

    assert link(client, feed_id, 999).status_code == 422


def test_feed_lectures_are_read_only_and_go_with_the_feed(client, db):
    module = make_module(db)
    feed_id = upload(client, timetable()).json()["id"]
    link(client, feed_id, module.id)
    lecture_id = lectures(client, module.id)[0]["id"]

    assert client.patch(f"/lectures/{lecture_id}", json={"title": "Renamed"}).status_code == 409
    assert client.delete(f"/lectures/{lecture_id}").status_code == 409
    assert "Timetable" in client.delete(f"/lectures/{lecture_id}").json()["detail"]

    client.delete(f"/calendar-feeds/{feed_id}")
    assert lectures(client, module.id) == []


def test_file_feeds_are_never_fetched(client, db, monkeypatch):
    feed_id = upload(client, timetable()).json()["id"]
    db.get(CalendarFeed, feed_id).last_synced_at = utc_now() - timedelta(days=1)  # stale
    db.commit()
    monkeypatch.setattr(calendar_feeds, "fetch_ics", lambda _url: pytest.fail("a file feed was fetched"))

    assert client.post("/calendar-feeds/refresh-stale").json() == {"refreshed": 0}
    assert client.post(f"/calendar-feeds/{feed_id}/refresh").status_code == 400
    assert client.patch(f"/calendar-feeds/{feed_id}", json={"url": "https://example.com/a.ics"}).status_code == 400
    assert client.patch(f"/calendar-feeds/{feed_id}", json={"name": "Uni"}).json()["source"] == "file"


# --- the Submodules a Lecture covered (manual and feed Lectures alike) -----------------------------


def make_submodules(db: Session, module: Module, *titles: str) -> list[Submodule]:
    submodules = [Submodule(module=module, title=title, created_at=utc_now(), updated_at=utc_now()) for title in titles]
    db.add_all(submodules)
    db.commit()
    return submodules


def submodule_titles(lecture: dict) -> list[str]:
    return [s["title"] for s in lecture["submodules"]]


def test_a_manual_lecture_can_be_given_and_cleared_of_submodules(client, db):
    module = make_module(db)
    graphs, sorting = make_submodules(db, module, "Graphs", "Sorting")

    created = client.post("/lectures", json={
        "module_id": module.id, "title": "Lecture 1", "scheduled_at": at(1, 10).isoformat(), "submodule_ids": [sorting.id],
    }).json()  # fmt: skip
    assert submodule_titles(created) == ["Sorting"]

    updated = client.patch(f"/lectures/{created['id']}", json={"submodule_ids": [sorting.id, graphs.id]}).json()
    assert submodule_titles(updated) == ["Graphs", "Sorting"]  # by title
    assert client.patch(f"/lectures/{created['id']}", json={"submodule_ids": []}).json()["submodules"] == []


def test_submodules_from_another_module_are_rejected(client, db):
    module, other = make_module(db), make_module(db)
    (foreign,) = make_submodules(db, other, "Elsewhere")
    lecture = Lecture(module_id=module.id, title="Lecture 1", scheduled_at=at(1, 10))
    db.add(lecture)
    db.commit()

    assert client.patch(f"/lectures/{lecture.id}", json={"submodule_ids": [foreign.id]}).status_code == 422
    assert client.patch(f"/lectures/{lecture.id}", json={"submodule_ids": [999]}).status_code == 422
    body = {"module_id": module.id, "title": "Lecture 2", "scheduled_at": at(2, 10).isoformat(), "submodule_ids": [foreign.id]}
    assert client.post("/lectures", json=body).status_code == 422


def test_feed_lectures_take_submodules_and_keep_them_across_resyncs(client, db):
    module = make_module(db)
    (topic,) = make_submodules(db, module, "Topic 3")
    feed_id = upload(client, timetable()).json()["id"]
    link(client, feed_id, module.id)
    week3 = next(lec for lec in lectures(client, module.id) if lec["scheduled_at"] == at(3, 10).isoformat())

    # Everything else about a feed lecture is the feed's, and still read-only.
    assert client.patch(f"/lectures/{week3['id']}", json={"submodule_ids": [topic.id], "title": "X"}).status_code == 409
    assert client.patch(f"/lectures/{week3['id']}", json={"submodule_ids": [topic.id]}).status_code == 200

    # Week 3 moves to Wednesday: same Lecture, same Submodule.
    client.put(
        f"/calendar-feeds/{feed_id}/file",
        files={"file": ("timetable.ics", timetable(moved_week=3).encode(), "text/calendar")},
    )
    rows = {lec["id"]: lec for lec in lectures(client, module.id)}
    assert rows[week3["id"]]["scheduled_at"] == at(3, 14, weekday=2).isoformat()
    assert submodule_titles(rows[week3["id"]]) == ["Topic 3"]


def test_linking_a_series_to_another_module_drops_its_submodules(client, db):
    module, other = make_module(db), make_module(db)
    (topic,) = make_submodules(db, module, "Topic 1")
    feed_id = upload(client, timetable()).json()["id"]
    link(client, feed_id, module.id)
    lecture_id = lectures(client, module.id)[0]["id"]
    client.patch(f"/lectures/{lecture_id}", json={"submodule_ids": [topic.id]})

    link(client, feed_id, other.id)

    moved = next(lec for lec in lectures(client, other.id) if lec["id"] == lecture_id)
    assert moved["submodules"] == []


def test_deleting_a_submodule_only_drops_its_links(client, db):
    module = make_module(db)
    keep, drop = make_submodules(db, module, "Keep", "Drop")
    lecture = Lecture(module_id=module.id, title="Lecture 1", scheduled_at=at(1, 10), submodules=[keep, drop])
    db.add(lecture)
    db.commit()

    db.delete(drop)
    db.commit()
    db.expire_all()

    assert [submodule_titles(lec) for lec in lectures(client, module.id)] == [["Keep"]]


def test_calendar_lectures_carry_their_submodules(client, db):
    module = make_module(db)
    graphs, sorting = make_submodules(db, module, "Graphs", "Sorting")
    db.add_all([
        Lecture(module_id=module.id, title="Lecture 1", scheduled_at=at(1, 10), submodules=[graphs]),
        Lecture(module_id=module.id, title="Lecture 2", scheduled_at=at(2, 10), submodules=[graphs, sorting]),
        Lecture(module_id=module.id, title="Lecture 3", scheduled_at=at(3, 10)),
    ])  # fmt: skip
    db.commit()

    params = {"start": at(1, 0).isoformat(), "end": at(5, 0).isoformat()}
    events = [e for e in client.get("/calendar", params=params).json() if e["kind"] == "lecture"]
    assert [[s["title"] for s in e["submodules"]] for e in events] == [["Graphs"], ["Graphs", "Sorting"], []]
