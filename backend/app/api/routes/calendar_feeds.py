import re

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.crud.calendar_feeds import (
    FeedParseError,
    feed_series,
    load_file,
    normalize_feed_url,
    refresh_feed,
    refresh_stale_feeds,
    resync_feed,
)
from app.models.calendar_feed import CalendarFeed, CalendarFeedLink
from app.models.module import Module
from app.schemas.calendar_feed import (
    CalendarFeedCreate,
    CalendarFeedRead,
    CalendarFeedsRefreshed,
    CalendarFeedUpdate,
    FeedLinkItem,
    FeedSeriesRead,
)

router = APIRouter(prefix="/calendar-feeds", tags=["calendar-feeds"])

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
# A university timetable for a year is well under this.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024


def _validate(feed: CalendarFeed) -> None:
    """Normalizes `name`/`url` in place and 422s on an unusable feed. Runs on the merged row.
    A file feed (`url` None) stays one."""
    feed.name = (feed.name or "").strip()
    if not feed.name:
        raise HTTPException(422, "Name is required")
    if feed.url is not None:
        try:
            feed.url = normalize_feed_url(feed.url)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    if not _HEX_COLOR.match(feed.color or ""):
        raise HTTPException(422, "Colour must be a hex colour like #3b82f6")


def _get_or_404(db: Session, feed_id: int) -> CalendarFeed:
    feed = db.get(CalendarFeed, feed_id)
    if feed is None:
        raise HTTPException(404, "Calendar feed not found")
    return feed


def _read(db: Session, feed: CalendarFeed) -> CalendarFeedRead:
    db.refresh(feed)
    return CalendarFeedRead.from_row(feed)


@router.get("", response_model=list[CalendarFeedRead])
def list_calendar_feeds(db: Session = Depends(get_db)) -> list[CalendarFeedRead]:
    stmt = select(CalendarFeed).order_by(CalendarFeed.id).options(selectinload(CalendarFeed.events))
    return [CalendarFeedRead.from_row(f) for f in db.scalars(stmt).all()]


@router.post("", response_model=CalendarFeedRead, status_code=201)
def create_calendar_feed(payload: CalendarFeedCreate, db: Session = Depends(get_db)) -> CalendarFeedRead:
    """Saves the feed and fetches it straight away. A failed first fetch still saves it, with `last_error` set."""
    feed = CalendarFeed(**payload.model_dump())
    _validate(feed)
    db.add(feed)
    refresh_feed(feed)
    db.commit()
    return _read(db, feed)


@router.patch("/{feed_id}", response_model=CalendarFeedRead)
def update_calendar_feed(feed_id: int, payload: CalendarFeedUpdate, db: Session = Depends(get_db)) -> CalendarFeedRead:
    """A changed address drops the old address's events and is fetched straight away."""
    feed = _get_or_404(db, feed_id)
    changes = payload.model_dump(exclude_unset=True)
    if feed.url is None and changes.get("url") is not None:
        raise HTTPException(400, "This calendar is an uploaded file; replace the file instead")
    old_url = feed.url
    for field, value in changes.items():
        setattr(feed, field, value)
    _validate(feed)
    if feed.url != old_url:
        feed.events = []
        feed.lectures = []
        feed.source_text = None
        feed.last_synced_at = None
        refresh_feed(feed)
    db.commit()
    return _read(db, feed)


@router.delete("/{feed_id}", status_code=204)
def delete_calendar_feed(feed_id: int, db: Session = Depends(get_db)) -> None:
    db.delete(_get_or_404(db, feed_id))
    db.commit()


@router.post("/refresh-stale", response_model=CalendarFeedsRefreshed)
def refresh_stale_calendar_feeds(db: Session = Depends(get_db)) -> CalendarFeedsRefreshed:
    """Fetches every enabled feed not synced in the last hour. The calendar calls this when it's viewed."""
    refreshed = refresh_stale_feeds(db)
    db.commit()
    return CalendarFeedsRefreshed(refreshed=refreshed)


@router.post("/{feed_id}/refresh", response_model=CalendarFeedRead)
def refresh_calendar_feed(feed_id: int, db: Session = Depends(get_db)) -> CalendarFeedRead:
    """Fetches the feed now. A failure keeps the cached events and sets `last_error` (still 200).
    400 for an uploaded file, which has nothing to fetch."""
    feed = _get_or_404(db, feed_id)
    if feed.url is None:
        raise HTTPException(400, "This calendar is an uploaded file; replace the file instead")
    refresh_feed(feed)
    db.commit()
    return _read(db, feed)


async def _read_calendar_file(file: UploadFile) -> str:
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "That file is too big for a calendar (2 MB max)")
    return data.decode("utf-8-sig", errors="replace")


def _load_file_or_422(feed: CalendarFeed, ics_text: str) -> None:
    try:
        load_file(feed, ics_text)
    except FeedParseError as exc:
        raise HTTPException(422, "That isn't a calendar (.ics) file") from exc


@router.post("/upload", response_model=CalendarFeedRead, status_code=201)
async def upload_calendar_feed(
    file: UploadFile, name: str = Form(), color: str = Form(), db: Session = Depends(get_db)
) -> CalendarFeedRead:
    """Creates a feed from an uploaded .ics file (e.g. a downloaded university timetable)."""
    feed = CalendarFeed(name=name, url=None, color=color, enabled=True)
    _validate(feed)
    _load_file_or_422(feed, await _read_calendar_file(file))
    db.add(feed)
    db.commit()
    return _read(db, feed)


@router.put("/{feed_id}/file", response_model=CalendarFeedRead)
async def replace_calendar_feed_file(feed_id: int, file: UploadFile, db: Session = Depends(get_db)) -> CalendarFeedRead:
    """Replaces an uploaded feed's file (e.g. an updated timetable). Linked Lectures are updated in place."""
    feed = _get_or_404(db, feed_id)
    if feed.url is not None:
        raise HTTPException(400, "This calendar syncs from an address; it has no file to replace")
    _load_file_or_422(feed, await _read_calendar_file(file))
    db.commit()
    return _read(db, feed)


@router.get("/{feed_id}/series", response_model=list[FeedSeriesRead])
def list_feed_series(feed_id: int, db: Session = Depends(get_db)) -> list[FeedSeriesRead]:
    """The feed's timed event series (grouped by title), each with the Module it's linked to, if any."""
    feed = _get_or_404(db, feed_id)
    module_by_title = {link.title: link.module_id for link in feed.links}
    return [
        FeedSeriesRead(
            title=s.title,
            count=s.count,
            first_starts_at=s.first_starts_at,
            location=s.location,
            module_id=module_by_title.get(s.title),
        )
        for s in feed_series(feed)
    ]


@router.put("/{feed_id}/links", response_model=CalendarFeedRead)
def set_feed_links(feed_id: int, payload: list[FeedLinkItem], db: Session = Depends(get_db)) -> CalendarFeedRead:
    """Replaces the feed's series → Module links and re-applies its stored calendar: linked series
    become Lectures, unlinked ones go back to busy time. Titles not listed are unlinked."""
    feed = _get_or_404(db, feed_id)
    module_ids = {item.module_id for item in payload if item.module_id is not None}
    found = set(db.scalars(select(Module.id).where(Module.id.in_(module_ids))).all())
    if module_ids - found:
        raise HTTPException(422, "Unknown module")
    links = {item.title: item.module_id for item in payload if item.module_id is not None}
    # Delete the old rows before inserting: the unit of work inserts first, which would trip the
    # (feed_id, title) unique constraint for a title that stays linked.
    feed.links = []
    db.flush()
    feed.links = [CalendarFeedLink(title=title, module_id=module_id) for title, module_id in links.items()]
    resync_feed(feed)
    db.commit()
    return _read(db, feed)
