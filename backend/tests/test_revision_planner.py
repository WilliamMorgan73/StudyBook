import random
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from itertools import pairwise

import pytest

import app.models  # noqa: F401  registers relationship string refs before we touch the mapper
from app.crud.revision_planner import (
    NEUTRAL_WEAKNESS,
    NotEnoughTime,
    ProposedSession,
    schedule_revision,
    weakest_cards,
    weakness_scores,
)
from app.models.flashcard import Flashcard, FlashcardReview

MON, TUE, WED, THU, FRI, SAT, SUN = range(7)
EVERY_DAY = set(range(7))


def dt(*args: int) -> datetime:
    """A naive datetime, matching the DB columns."""
    return datetime(*args, tzinfo=UTC).replace(tzinfo=None)


# --- weakness scoring -------------------------------------------------------------------------

_ids = iter(range(1, 10_000))


def make_card(submodule_id: int | None, qualities: list[int] = (), ease: float = 2.5) -> Flashcard:
    """A card whose reviews happened one day apart, oldest first, in the order given."""
    card = Flashcard(id=next(_ids), module_id=1, submodule_id=submodule_id, front="Q", back="A", ease_factor=ease)
    for n, quality in enumerate(qualities):
        FlashcardReview(id=next(_ids), flashcard=card, quality=quality, reviewed_at=dt(2026, 5, 1) + timedelta(days=n))
    return card


def reviews_of(*cards: Flashcard) -> list[FlashcardReview]:
    return [r for card in cards for r in card.reviews]


def test_submodule_without_reviews_is_neutral():
    scores = weakness_scores(reviews_of(make_card(1, [5, 5])), [1, 2])

    assert scores[2] == NEUTRAL_WEAKNESS


def test_lapses_raise_weakness_and_correct_answers_lower_it():
    lapsing = make_card(1, [1, 2, 0, 1, 2, 1])
    solid = make_card(2, [5, 4, 5, 4, 5, 5])

    scores = weakness_scores(reviews_of(lapsing, solid), [1, 2])

    assert scores[1] > NEUTRAL_WEAKNESS > scores[2]


def test_quality_three_is_not_a_lapse():
    scores = weakness_scores(reviews_of(make_card(1, [3] * 10)), [1])

    assert scores[1] < NEUTRAL_WEAKNESS


def test_only_the_latest_reviews_count():
    # Long ago it lapsed constantly; the most recent `last_n` reviews are all correct.
    recovered = make_card(1, [0] * 30 + [5] * 10)
    still_weak = make_card(2, [5] * 30 + [0] * 10)

    scores = weakness_scores(reviews_of(recovered, still_weak), [1, 2], last_n=10)

    assert scores[1] < 0.2
    assert scores[2] > 0.8


def test_reviews_pool_across_a_submodules_cards_and_ignore_others():
    scores = weakness_scores(reviews_of(make_card(1, [0, 0]), make_card(1, [0, 0]), make_card(3, [5] * 50)), [1])

    assert set(scores) == {1}
    assert scores[1] > 0.6


def test_weakest_cards_rank_by_recent_lapse_rate_and_skip_unreviewed():
    weak = make_card(1, [1, 1, 5])
    weaker = make_card(1, [1, 1, 1])
    fine = make_card(1, [5, 5, 5])
    never = make_card(1, [])

    ranked = weakest_cards([fine, never, weak, weaker])

    assert [w.flashcard for w in ranked] == [weaker, weak, fine]
    assert ranked[0].lapse_rate == 1
    assert ranked[1].review_count == 3


def test_weakest_cards_break_ties_by_ease_and_respect_limit():
    hard = make_card(1, [1], ease=1.3)
    easy = make_card(1, [1], ease=2.5)

    assert [w.flashcard for w in weakest_cards([easy, hard], limit=1)] == [hard]


# --- scheduler --------------------------------------------------------------------------------

# 2026-06-01 is a Monday; the exam is the Monday two weeks later.
START = date(2026, 6, 1)
EXAM = dt(2026, 6, 15, 9)


def plan(**overrides) -> list[ProposedSession] | NotEnoughTime:
    args = {
        "exam_starts_at": EXAM,
        "submodule_ids": [1, 2, 3],
        "weakness": {},
        "start_date": START,
        "weekdays": EVERY_DAY,
        "session_minutes": 60,
        "blocked": [],
    }
    return schedule_revision(**(args | overrides))


def overlaps(session: ProposedSession, interval: tuple[datetime, datetime]) -> bool:
    end = session.starts_at + timedelta(minutes=session.duration_minutes)
    return session.starts_at < interval[1] and end > interval[0]


def test_one_session_per_chosen_weekday_between_start_and_exam():
    sessions = plan(weekdays={MON, WED, FRI})

    assert [s.starts_at.date() for s in sessions] == [
        date(2026, 6, 1), date(2026, 6, 3), date(2026, 6, 5),
        date(2026, 6, 8), date(2026, 6, 10), date(2026, 6, 12),
    ]
    assert all(s.duration_minutes == 60 for s in sessions)
    assert all(s.starts_at.hour == 9 for s in sessions)


def test_sessions_end_before_the_exam_starts():
    # The exam day itself is a chosen weekday, but the exam starts at 09:00, before any free slot.
    sessions = plan(weekdays={MON})

    assert [s.starts_at.date() for s in sessions] == [date(2026, 6, 1), date(2026, 6, 8)]

    afternoon_exam = plan(weekdays={MON}, exam_starts_at=dt(2026, 6, 15, 14))
    last = afternoon_exam[-1]
    assert last.starts_at == dt(2026, 6, 15, 9)
    assert last.starts_at + timedelta(minutes=60) <= dt(2026, 6, 15, 14)


def test_sessions_never_overlap_blocked_time():
    lecture = (dt(2026, 6, 1, 9), dt(2026, 6, 1, 10, 50))
    busy = (dt(2026, 6, 1, 11, 30), dt(2026, 6, 1, 13))
    other_exam_session = (dt(2026, 6, 2, 8, 30), dt(2026, 6, 2, 20, 30))
    blocked = [lecture, busy, other_exam_session]

    sessions = plan(blocked=blocked, weekdays={MON, TUE, WED})

    assert not any(overlaps(s, b) for s in sessions for b in blocked)
    # 10:50 snaps to 11:00, but 11:00-12:00 hits the busy block, so the first gap is 13:00.
    assert sessions[0].starts_at == dt(2026, 6, 1, 13)
    # Tuesday has no hour free inside the 09:00-21:00 window.
    assert date(2026, 6, 2) not in {s.starts_at.date() for s in sessions}


def test_overnight_blocks_from_the_previous_evening_are_respected():
    night_shift = (dt(2026, 5, 31, 22), dt(2026, 6, 1, 10))

    sessions = plan(blocked=[night_shift], weekdays={MON})

    assert sessions[0].starts_at == dt(2026, 6, 1, 10)


def test_not_before_skips_hours_already_gone():
    sessions = plan(weekdays={MON}, not_before=dt(2026, 6, 1, 15, 5))

    assert sessions[0].starts_at == dt(2026, 6, 1, 15, 15)


def test_every_covered_submodule_appears_at_least_once():
    ids = list(range(1, 8))
    sessions = plan(submodule_ids=ids, weakness={1: 1.0, 2: 0.9})

    covered = {i for s in sessions for i in s.submodule_ids}
    assert covered == set(ids)
    assert all(len(s.submodule_ids) == 1 for s in sessions)


def test_weak_submodules_get_more_sessions():
    sessions = plan(weakness={1: 0.9, 2: 0.5, 3: 0.1})

    counts = Counter(i for s in sessions for i in s.submodule_ids)
    assert len(sessions) == 14
    assert counts[1] > counts[2] > counts[3] >= 1
    assert sum(counts.values()) == 14


def test_a_submodules_sessions_are_spread_out_not_bunched():
    sessions = plan(weakness={1: 0.9, 2: 0.1, 3: 0.1})

    order = [s.submodule_ids[0] for s in sessions]
    assert all(a != b for a, b in pairwise(order) if a != 1)
    # The weakest topic isn't front-loaded: it also shows up in the last stretch before the exam.
    assert 1 in order[-4:]


def test_fewer_sessions_than_submodules_packs_several_into_each():
    sessions = plan(submodule_ids=[1, 2, 3, 4], weekdays={MON}, session_minutes=60, weakness={4: 0.9})

    assert len(sessions) == 2
    assert sorted(i for s in sessions for i in s.submodule_ids) == [1, 2, 3, 4]
    assert all(len(s.submodule_ids) == 2 for s in sessions)
    assert sessions[0].submodule_ids[0] == 4  # weakest first


def test_not_enough_time_when_topics_dont_fit():
    result = plan(submodule_ids=[1, 2, 3, 4, 5], weekdays={MON}, session_minutes=60)

    assert isinstance(result, NotEnoughTime)
    assert result.available_sessions == 2
    assert result.submodule_count == 5
    assert "isn't enough" in result.message


def test_not_enough_time_when_no_slot_is_free():
    result = plan(blocked=[(dt(2026, 5, 1), dt(2026, 7, 1))])

    assert isinstance(result, NotEnoughTime)
    assert result.available_sessions == 0
    assert "single session" in result.message


def test_start_date_after_exam_gives_not_enough_time():
    assert isinstance(plan(start_date=date(2026, 6, 20)), NotEnoughTime)


def test_same_inputs_give_the_same_plan_regardless_of_order():
    blocked = [(dt(2026, 6, d, 9), dt(2026, 6, d, 11)) for d in range(1, 15)] + [(dt(2026, 6, 3, 12), dt(2026, 6, 3, 14))]
    weakness = {1: 0.7, 2: 0.7, 3: 0.2, 4: 0.5}
    baseline = plan(submodule_ids=[1, 2, 3, 4], weakness=weakness, blocked=blocked)

    rng = random.Random(0)
    for _ in range(5):
        shuffled_ids, shuffled_blocked = [1, 2, 3, 4], list(blocked)
        rng.shuffle(shuffled_ids)
        rng.shuffle(shuffled_blocked)
        assert plan(submodule_ids=shuffled_ids, weakness=weakness, blocked=shuffled_blocked) == baseline


def test_no_covered_submodules_is_an_error():
    with pytest.raises(ValueError):
        plan(submodule_ids=[])
