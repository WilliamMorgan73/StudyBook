from collections import Counter
from collections.abc import Iterable
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.flashcard import Flashcard, FlashcardReview


def count_by_local_day(times: Iterable[datetime], tz: ZoneInfo, start: date, end: date) -> dict[date, int]:
    """How many of `times` (naive UTC, as review timestamps are stored) fall on each local day in
    `tz`, from `start` to `end` inclusive. Days with none are left out."""
    counts: Counter[date] = Counter()
    for t in times:
        day = t.replace(tzinfo=UTC).astimezone(tz).date()
        if start <= day <= end:
            counts[day] += 1
    return dict(counts)


def review_activity(db: Session, tz: ZoneInfo, start: date, end: date, module_id: int | None = None) -> dict[date, int]:
    """Flashcard reviews per local day, of every card or one Module's: the activity heatmap's data."""
    # A day either side covers every UTC offset.
    lo = datetime.combine(start - timedelta(days=1), datetime.min.time())
    hi = datetime.combine(end + timedelta(days=2), datetime.min.time())
    query = select(FlashcardReview.reviewed_at).where(FlashcardReview.reviewed_at >= lo, FlashcardReview.reviewed_at < hi)
    if module_id is not None:
        query = query.join(Flashcard, Flashcard.id == FlashcardReview.flashcard_id).where(Flashcard.module_id == module_id)
    times = db.scalars(query).all()
    return count_by_local_day(times, tz, start, end)
