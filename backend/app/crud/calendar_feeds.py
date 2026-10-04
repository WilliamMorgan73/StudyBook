"""ICS calendar feeds: parsing (pure) and applying a parse to the DB (busy events and linked Lectures).

`parse_feed` turns ICS text into concrete occurrences with recurrences expanded. `apply_occurrences`
turns linked series into their Module's Lectures (upserted by occurrence identity, so ids are stable)
and caches the rest as `CalendarFeedEvent`s. `refresh_feed` fetches a URL feed and `resync_feed`
re-applies the stored text (uploads, link changes); both keep the last good copy on any failure.
Feed URLs are secrets, so they never appear in error messages or logs.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass, replace
from datetime import UTC, datetime, time, timedelta
from urllib.parse import urlsplit

import httpx
import recurring_ical_events
from icalendar import Calendar
from sqlalchemy import select
from sqlalchemy.orm import Session, contains_eager

from app.core.clock import local_now
from app.models.calendar_feed import CalendarFeed, CalendarFeedEvent
from app.models.lecture import Lecture
from app.models.module import Module

# How much of a feed is cached, relative to the time of the refresh.
WINDOW_PAST = timedelta(days=30)
WINDOW_FUTURE = timedelta(days=365)
# A feed older than this is refreshed when the calendar is viewed.
STALE_AFTER = timedelta(hours=1)
FETCH_TIMEOUT_SECONDS = 10.0
UNTITLED = "Busy"
# Lecture.location is a String(200).
MAX_LOCATION_CHARS = 200


class FeedParseError(ValueError):
    """The text isn't a usable iCalendar file."""


class FeedFetchError(Exception):
    """The feed couldn't be downloaded. The message is readable and never contains the URL."""


@dataclass(frozen=True)
class FeedOccurrence:
    title: str
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    uid_key: str = ""
    """UID plus the occurrence's original start (its RECURRENCE-ID), stable when an occurrence moves
    or the file is re-downloaded. Identifies the Lecture a linked occurrence becomes."""
    location: str | None = None


def normalize_feed_url(url: str) -> str:
    """Trimmed, with `webcal://` (what calendar apps hand out) turned into `https://`.

    Raises ValueError unless the result is an http(s) URL with a host.
    """
    url = url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://") :]
    parts = urlsplit(url)
    if parts.scheme.lower() not in ("http", "https") or not parts.netloc:
        raise ValueError("Enter an http(s) or webcal address")
    return url


def _local_naive(value: datetime) -> datetime:
    """Aware datetimes become the server's local wall-clock time; floating ones are kept as-is."""
    if value.tzinfo is None:
        return value
    return value.astimezone().replace(tzinfo=None)


def _occurrence(event) -> FeedOccurrence | None:
    if str(event.get("TRANSP", "")).upper() == "TRANSPARENT":
        return None
    if str(event.get("STATUS", "")).upper() == "CANCELLED":
        return None
    dtstart = event.get("DTSTART")
    if dtstart is None:
        return None
    start = dtstart.dt
    dtend = event.get("DTEND")
    duration = event.get("DURATION")
    title = str(event.get("SUMMARY") or "").strip() or UNTITLED
    location = " ".join(str(event.get("LOCATION") or "").split())[:MAX_LOCATION_CHARS] or None
    # recurring_ical_events sets RECURRENCE-ID on every occurrence it yields; a lone event has DTSTART.
    original = event.get("RECURRENCE-ID") or dtstart
    uid_key = f"{event.get('UID', '')}|{original.dt.isoformat()}"

    if not isinstance(start, datetime):  # a `date`: all-day
        if dtend is not None:
            end = dtend.dt
        elif duration is not None:
            end = start + duration.dt
        else:
            end = start + timedelta(days=1)
        end_day = end.date() if isinstance(end, datetime) else end
        end_day = max(end_day, start + timedelta(days=1))
        return FeedOccurrence(
            title=title,
            starts_at=datetime.combine(start, time()),
            ends_at=datetime.combine(end_day, time()),
            all_day=True,
            uid_key=uid_key,
            location=location,
        )

    if dtend is not None:
        end = dtend.dt
        if not isinstance(end, datetime):
            end = datetime.combine(end, time(), tzinfo=start.tzinfo)
    elif duration is not None:
        end = start + duration.dt
    else:
        end = start
    starts_at, ends_at = _local_naive(start), _local_naive(end)
    if ends_at <= starts_at:
        return None  # zero-length (or malformed) events can't make anyone busy
    return FeedOccurrence(
        title=title, starts_at=starts_at, ends_at=ends_at, all_day=False, uid_key=uid_key, location=location
    )


def _split_days(occ: FeedOccurrence) -> list[FeedOccurrence]:
    """A multi-day all-day event as one occurrence per day, since the calendar places events on their
    start day. Timed events are left whole."""
    if not occ.all_day:
        return [occ]
    days = []
    day = occ.starts_at
    while day < occ.ends_at:
        days.append(replace(occ, starts_at=day, ends_at=day + timedelta(days=1)))
        day += timedelta(days=1)
    return days


def parse_feed(ics_text: str, window_start: datetime, window_end: datetime) -> list[FeedOccurrence]:
    """Every busy occurrence in the feed overlapping [window_start, window_end), sorted.

    Recurrences (RRULE/RDATE/EXDATE, and RECURRENCE-ID overrides) are expanded. Events marked
    free (`TRANSP:TRANSPARENT`) or cancelled are skipped. Timed events are converted to the
    server's local time, naive; all-day events run midnight to midnight, one occurrence per day,
    and have `all_day` set.
    The window bounds are local naive datetimes.
    """
    try:
        calendar = Calendar.from_ical(ics_text)
        if calendar.name != "VCALENDAR":
            raise FeedParseError("Not an iCalendar file")
        events = recurring_ical_events.of(calendar).between(window_start, window_end)
    except FeedParseError:
        raise
    except Exception as exc:  # icalendar and recurring_ical_events raise assorted types on bad input
        raise FeedParseError("Not a valid iCalendar file") from exc

    occurrences = [day for occ in map(_occurrence, events) if occ is not None for day in _split_days(occ)]
    return sorted(
        (o for o in occurrences if o.ends_at > window_start and o.starts_at < window_end),
        key=lambda o: (o.starts_at, o.ends_at, o.title),
    )


def fetch_ics(url: str) -> str:
    """Downloads a feed's text. Raises FeedFetchError with a URL-free message."""
    try:
        response = httpx.get(url, timeout=FETCH_TIMEOUT_SECONDS, follow_redirects=True)
    except httpx.TimeoutException as exc:
        raise FeedFetchError("The calendar took too long to respond") from exc
    except httpx.HTTPError as exc:
        raise FeedFetchError("Couldn't reach the calendar (offline?)") from exc
    if response.status_code in (401, 403, 404):
        raise FeedFetchError(f"The calendar address was rejected ({response.status_code}); it may have been reset")
    if response.status_code >= 400:
        raise FeedFetchError(f"The calendar server returned an error ({response.status_code})")
    return response.text


Fetch = Callable[[str], str]


def cache_window(now: datetime | None = None) -> tuple[datetime, datetime]:
    now = now or local_now()
    return now - WINDOW_PAST, now + WINDOW_FUTURE


def apply_occurrences(
    feed: CalendarFeed, occurrences: Iterable[FeedOccurrence], window: tuple[datetime, datetime]
) -> None:
    """Makes the DB match a parse of `feed` over `window`.

    Timed occurrences whose title has a `CalendarFeedLink` become that Module's Lectures, upserted by
    `uid_key` so a moved occurrence keeps its Lecture's id. Feed Lectures missing from the parse are
    deleted, but only those starting inside `window`: older ones have just scrolled out of the cache,
    not out of the timetable. Every other occurrence replaces the busy cache. The caller commits.
    """
    module_by_title = {link.title: link.module_id for link in feed.links}
    existing = {lecture.feed_uid: lecture for lecture in feed.lectures}
    seen: set[str] = set()
    busy: list[CalendarFeedEvent] = []
    for occ in occurrences:
        module_id = module_by_title.get(occ.title)
        if module_id is None or occ.all_day or occ.uid_key in seen:
            busy.append(CalendarFeedEvent(title=occ.title, starts_at=occ.starts_at, ends_at=occ.ends_at, all_day=occ.all_day))
            continue
        seen.add(occ.uid_key)
        lecture = existing.get(occ.uid_key)
        if lecture is None:
            lecture = Lecture(feed_uid=occ.uid_key)
            feed.lectures.append(lecture)
        if lecture.module_id != module_id:
            # The series was linked to another Module; its Submodules would now be the wrong Module's.
            lecture.submodules = []
        lecture.module_id = module_id
        lecture.title = occ.title[:200]
        lecture.scheduled_at = occ.starts_at
        lecture.duration_minutes = round((occ.ends_at - occ.starts_at).total_seconds() / 60)
        lecture.location = occ.location
    window_start, window_end = window
    for uid, lecture in existing.items():
        if uid not in seen and window_start <= lecture.scheduled_at < window_end:
            feed.lectures.remove(lecture)
    feed.events = busy


def _record_sync(feed: CalendarFeed, ics_text: str) -> None:
    feed.source_text = ics_text
    feed.last_synced_at = datetime.now(UTC).replace(tzinfo=None)
    feed.last_error = None


def refresh_feed(feed: CalendarFeed, fetch: Fetch | None = None, now: datetime | None = None) -> bool:
    """Fetches and re-parses a URL feed, then applies it (`apply_occurrences`). Returns whether it
    succeeded. File feeds have nothing to fetch and are left alone (False).

    Any failure keeps the cached events, Lectures and `last_synced_at`, and records `last_error`
    instead of raising. `fetch` defaults to `fetch_ics`, looked up per call so tests can patch it.
    The caller commits.
    """
    if feed.url is None:
        return False
    window = cache_window(now)
    fetch = fetch or fetch_ics
    try:
        ics_text = fetch(feed.url)
        occurrences = parse_feed(ics_text, *window)
    except FeedFetchError as exc:
        feed.last_error = str(exc)
        return False
    except FeedParseError:
        feed.last_error = "The address didn't return a calendar file"
        return False
    apply_occurrences(feed, occurrences, window)
    _record_sync(feed, ics_text)
    return True


def load_file(feed: CalendarFeed, ics_text: str, now: datetime | None = None) -> None:
    """Applies an uploaded file to `feed` and keeps it as the feed's source. Raises FeedParseError
    (changing nothing) if it isn't a calendar. The caller commits."""
    window = cache_window(now)
    occurrences = parse_feed(ics_text, *window)
    apply_occurrences(feed, occurrences, window)
    _record_sync(feed, ics_text)


def resync_feed(feed: CalendarFeed, now: datetime | None = None) -> None:
    """Re-applies the feed's stored source text, e.g. after its links change. No fetch, and
    `last_synced_at` is unchanged. A feed that never synced has nothing to apply. The caller commits."""
    if feed.source_text is None:
        return
    window = cache_window(now)
    apply_occurrences(feed, parse_feed(feed.source_text, *window), window)


@dataclass(frozen=True)
class FeedSeries:
    title: str
    count: int
    first_starts_at: datetime
    location: str | None


def feed_series(feed: CalendarFeed, now: datetime | None = None) -> list[FeedSeries]:
    """The feed's timed event series (grouped by exact title) within the cache window, by title.
    All-day events are left out: they can't become Lectures."""
    if feed.source_text is None:
        return []
    by_title: dict[str, list[FeedOccurrence]] = {}
    for occ in parse_feed(feed.source_text, *cache_window(now)):
        if not occ.all_day:
            by_title.setdefault(occ.title, []).append(occ)
    return [
        FeedSeries(
            title=title,
            count=len(occs),
            first_starts_at=occs[0].starts_at,
            location=next((o.location for o in occs if o.location), None),
        )
        for title, occs in sorted(by_title.items(), key=lambda item: item[0].lower())
    ]


def suggested_module_id(title: str, modules: Iterable[Module]) -> int | None:
    """The Module a series title looks like it belongs to: one whose course code starts the title
    (ignoring case) and isn't followed by a letter or digit, so "COMP4177" matches "COMP4177: Networks
    - Lecture" but not "COMP41770". The longest matching code wins; Modules without a code never match."""
    best: tuple[int, int] | None = None
    folded = title.casefold()
    for module in modules:
        code = (module.code or "").strip().casefold()
        if not code or not folded.startswith(code):
            continue
        rest = folded[len(code):]
        if rest and rest[0].isalnum():
            continue
        if best is None or len(code) > best[0]:
            best = (len(code), module.id)
    return best[1] if best else None


def is_stale(feed: CalendarFeed, utc_now: datetime) -> bool:
    return feed.last_synced_at is None or utc_now - feed.last_synced_at >= STALE_AFTER


def refresh_feeds(feeds: Iterable[CalendarFeed], fetch: Fetch | None = None) -> int:
    """Refreshes each feed (failures recorded per feed). Returns how many succeeded. The caller commits."""
    return sum(refresh_feed(feed, fetch) for feed in feeds)


def enabled_feeds(db: Session) -> list[CalendarFeed]:
    """Enabled URL feeds: the ones there's something to fetch for."""
    stmt = select(CalendarFeed).where(CalendarFeed.enabled, CalendarFeed.url.is_not(None))
    return list(db.scalars(stmt).all())


def refresh_stale_feeds(db: Session, fetch: Fetch | None = None) -> int:
    """Refreshes every enabled feed not synced within `STALE_AFTER`. Returns how many succeeded.
    The caller commits (failures change `last_error`, so commit either way)."""
    utc_now = datetime.now(UTC).replace(tzinfo=None)
    return refresh_feeds((f for f in enabled_feeds(db) if is_stale(f, utc_now)), fetch)


def feed_events_between(
    db: Session, start: datetime, end: datetime, *, include_all_day: bool = True
) -> list[CalendarFeedEvent]:
    """Cached events of enabled feeds overlapping [start, end), sorted, with `feed` loaded."""
    stmt = (
        select(CalendarFeedEvent)
        .join(CalendarFeedEvent.feed)
        .where(CalendarFeed.enabled, CalendarFeedEvent.starts_at < end, CalendarFeedEvent.ends_at > start)
        .order_by(CalendarFeedEvent.starts_at, CalendarFeedEvent.id)
        .options(contains_eager(CalendarFeedEvent.feed))
    )
    if not include_all_day:
        stmt = stmt.where(CalendarFeedEvent.all_day.is_(False))
    return list(db.scalars(stmt).all())

