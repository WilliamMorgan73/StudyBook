"""ICS calendar feeds: parsing (pure) and refreshing the cached events (DB + network).

`parse_feed` turns ICS text into concrete occurrences with recurrences expanded; `refresh_feed`
fetches a feed and replaces its cached `CalendarFeedEvent`s, keeping the last good copy on any
failure. Feed URLs are secrets, so they never appear in error messages or logs.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from urllib.parse import urlsplit

import httpx
import recurring_ical_events
from icalendar import Calendar
from sqlalchemy import select
from sqlalchemy.orm import Session, contains_eager

from app.core.clock import local_now
from app.models.calendar_feed import CalendarFeed, CalendarFeedEvent

# How much of a feed is cached, relative to the time of the refresh.
WINDOW_PAST = timedelta(days=30)
WINDOW_FUTURE = timedelta(days=365)
# A feed older than this is refreshed when the calendar is viewed.
STALE_AFTER = timedelta(hours=1)
FETCH_TIMEOUT_SECONDS = 10.0
UNTITLED = "Busy"


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
    return FeedOccurrence(title=title, starts_at=starts_at, ends_at=ends_at, all_day=False)


def _split_days(occ: FeedOccurrence) -> list[FeedOccurrence]:
    """A multi-day all-day event as one occurrence per day, since the calendar places events on their
    start day. Timed events are left whole."""
    if not occ.all_day:
        return [occ]
    days = []
    day = occ.starts_at
    while day < occ.ends_at:
        days.append(FeedOccurrence(title=occ.title, starts_at=day, ends_at=day + timedelta(days=1), all_day=True))
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


def refresh_feed(feed: CalendarFeed, fetch: Fetch | None = None, now: datetime | None = None) -> bool:
    """Fetches and re-parses `feed`, replacing its cached events. Returns whether it succeeded.

    Any failure keeps the cached events and `last_synced_at`, and records `last_error` instead of
    raising. `fetch` defaults to `fetch_ics`, looked up per call so tests can patch it. The caller commits.
    """
    now = now or local_now()
    fetch = fetch or fetch_ics
    try:
        occurrences = parse_feed(fetch(feed.url), now - WINDOW_PAST, now + WINDOW_FUTURE)
    except FeedFetchError as exc:
        feed.last_error = str(exc)
        return False
    except FeedParseError:
        feed.last_error = "The address didn't return a calendar file"
        return False
    feed.events = [
        CalendarFeedEvent(title=o.title, starts_at=o.starts_at, ends_at=o.ends_at, all_day=o.all_day)
        for o in occurrences
    ]
    feed.last_synced_at = datetime.now(UTC).replace(tzinfo=None)
    feed.last_error = None
    return True


def is_stale(feed: CalendarFeed, utc_now: datetime) -> bool:
    return feed.last_synced_at is None or utc_now - feed.last_synced_at >= STALE_AFTER


def refresh_feeds(feeds: Iterable[CalendarFeed], fetch: Fetch | None = None) -> int:
    """Refreshes each feed (failures recorded per feed). Returns how many succeeded. The caller commits."""
    return sum(refresh_feed(feed, fetch) for feed in feeds)


def enabled_feeds(db: Session) -> list[CalendarFeed]:
    return list(db.scalars(select(CalendarFeed).where(CalendarFeed.enabled)).all())


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

