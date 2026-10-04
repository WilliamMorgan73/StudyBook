from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.models.flashcard import Flashcard, FlashcardReview


def apply_review(card: Flashcard, quality: int, now: datetime | None = None) -> None:
    """SM-2 algorithm. quality is 0-5 recall self-rating; >=3 counts as a correct response."""
    quality = max(0, min(5, quality))
    ease = float(card.ease_factor)

    if quality < 3:
        card.repetitions = 0
        card.interval_days = 1
    else:
        card.repetitions += 1
        if card.repetitions == 1:
            card.interval_days = 1
        elif card.repetitions == 2:
            card.interval_days = 6
        else:
            card.interval_days = round(card.interval_days * ease)

    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    card.ease_factor = max(1.3, ease)

    now = now or datetime.now(UTC)
    card.last_reviewed_at = now
    card.due_at = now + timedelta(days=card.interval_days)


def review_card(card: Flashcard, quality: int, now: datetime | None = None) -> FlashcardReview:
    """Reschedule the card and return the history row for this review; the caller adds it to the session."""
    now = now or datetime.now(UTC)
    apply_review(card, quality, now)
    return FlashcardReview(flashcard=card, quality=quality, reviewed_at=now)


# The qualities the study session's four buttons send (Again, Hard, Good, Easy).
RATING_QUALITIES = (1, 3, 4, 5)


def preview_intervals(card: Flashcard) -> dict[int, int]:
    """The interval in days each rating would give the card next, without changing it."""
    intervals: dict[int, int] = {}
    for quality in RATING_QUALITIES:
        copy = SimpleNamespace(
            ease_factor=card.ease_factor, repetitions=card.repetitions or 0, interval_days=card.interval_days or 0
        )
        apply_review(copy, quality)  # type: ignore[arg-type]  # only reads/writes the scheduling fields
        intervals[quality] = copy.interval_days
    return intervals
