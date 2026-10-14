from datetime import date
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.stats import review_activity

router = APIRouter(prefix="/stats", tags=["stats"])

# A little over a year: the heatmap's widest view, with room to spare.
MAX_DAYS = 400


@router.get("/activity", response_model=dict[date, int])
def get_activity(
    start: date, end: date, tz: str = "UTC", module_id: int | None = None, db: Session = Depends(get_db)
) -> dict[date, int]:
    """Flashcard reviews per day from `start` to `end` (inclusive), by local date in `tz` (an IANA
    zone; reviews are stored in UTC), optionally only one Module's cards. Days with none are left out."""
    if end < start or (end - start).days > MAX_DAYS:
        raise HTTPException(422, f"end must be on or after start, at most {MAX_DAYS} days later")
    try:
        zone = ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError) as err:
        raise HTTPException(422, f"Unknown time zone: {tz}") from err
    return review_activity(db, zone, start, end, module_id)
