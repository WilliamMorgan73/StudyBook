from datetime import UTC, datetime, timedelta

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.crud.spaced_repetition import (
    RATING_QUALITIES,
    apply_review,
    preview_intervals,
    review_card,
)
from app.models.flashcard import Flashcard

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


def make_card(ease_factor: float = 2.5, interval_days: int = 0, repetitions: int = 0) -> Flashcard:
    return Flashcard(
        front="Q", back="A", ease_factor=ease_factor, interval_days=interval_days, repetitions=repetitions
    )


def test_first_two_correct_reviews_use_fixed_intervals():
    card = make_card()

    apply_review(card, 4, NOW)
    assert (card.repetitions, card.interval_days) == (1, 1)

    apply_review(card, 4, NOW)
    assert (card.repetitions, card.interval_days) == (2, 6)


def test_later_correct_reviews_multiply_interval_by_ease():
    card = make_card(ease_factor=2.5, interval_days=6, repetitions=2)

    apply_review(card, 4, NOW)

    assert card.repetitions == 3
    assert card.interval_days == 15
    assert card.due_at == NOW + timedelta(days=15)
    assert card.last_reviewed_at == NOW


def test_failed_review_resets_repetitions_and_lowers_ease():
    card = make_card(ease_factor=2.5, interval_days=15, repetitions=3)

    apply_review(card, 1, NOW)

    assert (card.repetitions, card.interval_days) == (0, 1)
    assert card.ease_factor < 2.5
    assert card.due_at == NOW + timedelta(days=1)


def test_easy_raises_ease_and_good_keeps_it():
    easy, good = make_card(), make_card()

    apply_review(easy, 5, NOW)
    apply_review(good, 4, NOW)

    assert easy.ease_factor > 2.5
    assert good.ease_factor == 2.5


def test_ease_never_drops_below_floor():
    card = make_card(ease_factor=1.35)

    apply_review(card, 0, NOW)

    assert card.ease_factor == 1.3


def test_review_card_reschedules_and_records_history_row():
    card = make_card()

    review = review_card(card, 3, NOW)

    assert review.flashcard is card
    assert review.quality == 3
    assert review.reviewed_at == NOW
    assert card.due_at == NOW + timedelta(days=1)


def test_preview_intervals_match_apply_review_and_leave_the_card_alone():
    def fresh():
        return Flashcard(ease_factor=2.5, interval_days=6, repetitions=2)

    card = fresh()
    preview = preview_intervals(card)

    for quality in RATING_QUALITIES:
        reviewed = fresh()
        apply_review(reviewed, quality)
        assert preview[quality] == reviewed.interval_days
    assert (card.interval_days, card.repetitions, card.ease_factor) == (6, 2, 2.5)
