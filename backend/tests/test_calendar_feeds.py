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
from app.models import CalendarFeed, CalendarFeedEvent

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
