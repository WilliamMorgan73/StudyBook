import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.crud.calendar_feeds import (
    normalize_feed_url,
    refresh_feed,
    refresh_stale_feeds,
)
from app.models.calendar_feed import CalendarFeed
from app.schemas.calendar_feed import (
    CalendarFeedCreate,
    CalendarFeedRead,
    CalendarFeedsRefreshed,
    CalendarFeedUpdate,
)

router = APIRouter(prefix="/calendar-feeds", tags=["calendar-feeds"])

_HEX_COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate(feed: CalendarFeed) -> None:
    """Normalizes `name`/`url` in place and 422s on an unusable feed. Runs on the merged row."""
    feed.name = (feed.name or "").strip()
    if not feed.name:
        raise HTTPException(422, "Name is required")
    try:
        feed.url = normalize_feed_url(feed.url or "")
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
    old_url = feed.url
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(feed, field, value)
    _validate(feed)
    if feed.url != old_url:
        feed.events = []
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
    """Fetches the feed now. A failure keeps the cached events and sets `last_error` (still 200)."""
    feed = _get_or_404(db, feed_id)
    refresh_feed(feed)
    db.commit()
    return _read(db, feed)
