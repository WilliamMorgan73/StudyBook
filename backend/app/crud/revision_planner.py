"""Revision planner: weakness scoring and the session scheduler.

Pure, deterministic functions over (possibly unsaved) model instances and plain values; no DB access.
`crud/revision_plans.py` gathers their inputs from the DB. All datetimes are naive wall-clock times,
matching the DB columns.
"""

from collections import defaultdict
from collections.abc import Collection, Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Protocol

from app.crud.busy_time import merge_intervals
from app.models.flashcard import Flashcard, FlashcardReview

# How many of the latest reviews count towards a weakness score.
RECENT_REVIEWS = 20
# SM-2: a rating below 3 is an incorrect recall, i.e. a lapse.
LAPSE_BELOW_QUALITY = 3
# Weakness of a Submodule with no review data: halfway between "always right" (0) and "always lapses" (1).
NEUTRAL_WEAKNESS = 0.5
# Pseudo-reviews at the neutral score mixed into every Submodule's rate, so one unlucky review
# doesn't make a topic look maximally weak.
PRIOR_REVIEWS = 2

# Sessions are placed within this daily window.
DAY_START = time(9, 0)
DAY_END = time(21, 0)
# Session start times snap to this grid (minutes past midnight).
SLOT_STEP_MINUTES = 15
# When there are fewer sessions than topics, a session takes one extra topic per this many minutes.
MIN_MINUTES_PER_TOPIC = 30
# A covered Submodule whose weakness has moved at least this far since planning prompts a replan.
WEAKNESS_SHIFT = 0.2


def _latest(reviews: Iterable[FlashcardReview], n: int) -> list[FlashcardReview]:
    return sorted(reviews, key=lambda r: (r.reviewed_at, r.id or 0), reverse=True)[:n]


def _lapse_count(reviews: Iterable[FlashcardReview]) -> int:
    return sum(1 for r in reviews if r.quality < LAPSE_BELOW_QUALITY)


def weakness_scores(
    reviews: Iterable[FlashcardReview], submodule_ids: Iterable[int], last_n: int = RECENT_REVIEWS
) -> dict[int, float]:
    """A weakness score per Submodule, from 0 (never lapses) to 1 (always lapses).

    The score is the lapse rate (quality < 3) over the Submodule's latest `last_n` reviews, across all
    its Flashcards (`review.flashcard.submodule_id`), smoothed towards `NEUTRAL_WEAKNESS` by
    `PRIOR_REVIEWS`. A Submodule with no reviews scores exactly neutral. Reviews of other Submodules'
    cards are ignored.
    """
    wanted = set(submodule_ids)
    by_submodule: dict[int, list[FlashcardReview]] = defaultdict(list)
    for review in reviews:
        submodule_id = review.flashcard.submodule_id
        if submodule_id in wanted:
            by_submodule[submodule_id].append(review)

    scores: dict[int, float] = {}
    for submodule_id in wanted:
        recent = _latest(by_submodule[submodule_id], last_n)
        scores[submodule_id] = (_lapse_count(recent) + NEUTRAL_WEAKNESS * PRIOR_REVIEWS) / (len(recent) + PRIOR_REVIEWS)
    return scores


@dataclass(frozen=True)
class CardWeakness:
    flashcard: Flashcard
    lapse_rate: float
    """Over the card's latest `last_n` reviews."""
    review_count: int


def weakest_cards(cards: Iterable[Flashcard], limit: int = 10, last_n: int = RECENT_REVIEWS) -> list[CardWeakness]:
    """The reviewed cards with the highest recent lapse rate, weakest first (ties: lower ease, then id).

    Reads each card's `reviews`. Cards never reviewed are left out: there's nothing to say they're weak.
    """
    ranked: list[CardWeakness] = []
    for card in cards:
        recent = _latest(card.reviews, last_n)
        if recent:
            ranked.append(CardWeakness(card, _lapse_count(recent) / len(recent), len(recent)))
    ranked.sort(key=lambda w: (-w.lapse_rate, float(w.flashcard.ease_factor), w.flashcard.id or 0))
    return ranked[:limit]


@dataclass(frozen=True)
class ProposedSession:
    starts_at: datetime
    duration_minutes: int
    submodule_ids: tuple[int, ...]


@dataclass(frozen=True)
class NotEnoughTime:
    """The available time can't fit even one pass over every covered Submodule."""

    available_sessions: int
    submodule_count: int
    topics_per_session: int

    @property
    def message(self) -> str:
        if self.available_sessions == 0:
            return (
                "There isn't enough free time before the exam for a single session. "
                "Try an earlier start date, more weekdays or shorter sessions."
            )
        return (
            f"Only {self.available_sessions} session{'s' if self.available_sessions != 1 else ''} fit before "
            f"the exam, which isn't enough to cover all {self.submodule_count} topics "
            f"(at most {self.topics_per_session} per session). "
            "Try an earlier start date, more weekdays or longer sessions."
        )


def _ceil_to_step(moment: datetime) -> datetime:
    midnight = datetime.combine(moment.date(), time.min)
    step = timedelta(minutes=SLOT_STEP_MINUTES)
    steps = -(-(moment - midnight) // step)  # ceiling division
    return midnight + steps * step


def find_session_slots(
    *,
    start_date: date,
    end: datetime,
    weekdays: Collection[int],
    session_minutes: int,
    blocked: Iterable[tuple[datetime, datetime]],
    not_before: datetime | None = None,
    skip_dates: Collection[date] = (),
    day_start: time = DAY_START,
    day_end: time = DAY_END,
) -> list[datetime]:
    """Start times for at most one session per chosen weekday from `start_date` until `end`.

    Each is the earliest `SLOT_STEP_MINUTES`-aligned start in that day's `[day_start, day_end)` window
    (and not before `not_before`) whose whole session ends by `end` and overlaps no blocked interval.
    Days with no such gap, and `skip_dates`, get no session. `weekdays` uses `date.weekday()` numbering
    (0 = Monday).
    """
    blocked = merge_intervals(blocked)
    length = timedelta(minutes=session_minutes)
    slots: list[datetime] = []
    day = start_date
    while day <= end.date():
        if day.weekday() in weekdays and day not in skip_dates:
            window_start = datetime.combine(day, day_start)
            if not_before is not None:
                window_start = max(window_start, not_before)
            window_end = min(datetime.combine(day, day_end), end)
            candidate = _ceil_to_step(window_start)
            while candidate + length <= window_end:
                clash = next((e for s, e in blocked if s < candidate + length and e > candidate), None)
                if clash is None:
                    slots.append(candidate)
                    break
                candidate = _ceil_to_step(clash)
        day += timedelta(days=1)
    return slots


def _session_counts(slot_count: int, ids: list[int], weights: dict[int, float]) -> dict[int, int]:
    """One session per Submodule, then the rest shared by weight (largest remainder, weakest wins ties)."""
    counts = dict.fromkeys(ids, 1)
    extra = slot_count - len(ids)
    total = sum(weights.values())
    shares = {i: (extra * weights[i] / total if total else extra / len(ids)) for i in ids}
    for i in ids:
        counts[i] += int(shares[i])
    leftover = slot_count - sum(counts.values())
    by_remainder = sorted(ids, key=lambda i: (-(shares[i] - int(shares[i])), -weights[i], i))
    for i in by_remainder[:leftover]:
        counts[i] += 1
    return counts


def _spread(counts: dict[int, int], weights: dict[int, float]) -> list[int]:
    """Interleave each Submodule's sessions evenly across the plan, rather than in blocks."""
    entries = [((k + 0.5) / c, -weights[i], i) for i, c in counts.items() for k in range(c)]
    return [i for _, _, i in sorted(entries)]


def schedule_revision(
    *,
    exam_starts_at: datetime,
    submodule_ids: Iterable[int],
    weakness: Mapping[int, float],
    start_date: date,
    weekdays: Collection[int],
    session_minutes: int,
    blocked: Iterable[tuple[datetime, datetime]],
    not_before: datetime | None = None,
    skip_dates: Collection[date] = (),
    day_start: time = DAY_START,
    day_end: time = DAY_END,
) -> list[ProposedSession] | NotEnoughTime:
    """Propose revision sessions for an exam, or report that there isn't enough time.

    Sessions come from `find_session_slots` (so they never overlap `blocked`, which should hold lectures,
    busy time and other exams and their sessions) and end by `exam_starts_at`. Topics:

    - At least as many sessions as Submodules: every Submodule gets one session, and the remaining
      sessions go to Submodules in proportion to `weakness` (missing ids count as neutral), interleaved
      over the plan. Each session revises one Submodule.
    - Fewer sessions than Submodules: Submodules are dealt across sessions weakest first, up to one per
      `MIN_MINUTES_PER_TOPIC` of session length; if that still can't cover them all, `NotEnoughTime`.

    Deterministic: the same inputs give the same plan, whatever the order of `submodule_ids`/`blocked`.
    """
    ids = sorted(set(submodule_ids))
    if not ids:
        raise ValueError("An exam needs at least one covered Submodule to plan revision")
    weights = {i: weakness.get(i, NEUTRAL_WEAKNESS) for i in ids}
    slots = find_session_slots(
        start_date=start_date,
        end=exam_starts_at,
        weekdays=weekdays,
        session_minutes=session_minutes,
        blocked=blocked,
        not_before=not_before,
        skip_dates=skip_dates,
        day_start=day_start,
        day_end=day_end,
    )

    def session(slot: datetime, topic_ids: Sequence[int]) -> ProposedSession:
        return ProposedSession(starts_at=slot, duration_minutes=session_minutes, submodule_ids=tuple(topic_ids))

    if len(slots) >= len(ids):
        order = _spread(_session_counts(len(slots), ids, weights), weights)
        return [session(slot, [i]) for slot, i in zip(slots, order, strict=True)]

    per_session = max(1, session_minutes // MIN_MINUTES_PER_TOPIC)
    if not slots or len(ids) > len(slots) * per_session:
        return NotEnoughTime(available_sessions=len(slots), submodule_count=len(ids), topics_per_session=per_session)
    weakest_first = sorted(ids, key=lambda i: (-weights[i], i))
    return [session(slot, weakest_first[n :: len(slots)]) for n, slot in enumerate(slots)]


# --- replanning ---------------------------------------------------------------------------------


class PlannedSession(Protocol):
    """What replanning needs of a session; `RevisionSession` rows fit."""

    id: int
    starts_at: datetime
    duration_minutes: int
    done: bool



def split_for_replan[S: PlannedSession](sessions: Iterable[S], now: datetime) -> tuple[list[S], list[S]]:
    """`(kept, replaced)`: a replan keeps every session that is done or has started by `now`, and
    replaces the rest (future and not done) with freshly scheduled ones. Order is preserved."""
    kept: list[S] = []
    replaced: list[S] = []
    for session in sessions:
        (kept if session.done or session.starts_at < now else replaced).append(session)
    return kept, replaced


@dataclass(frozen=True)
class WeaknessShift:
    submodule_id: int
    planned: float
    current: float


@dataclass(frozen=True)
class ReplanSignal:
    missed_session_ids: tuple[int, ...]
    """Sessions of the current plan that have ended without being ticked done."""
    shifted: tuple[WeaknessShift, ...]
    """Covered Submodules whose weakness has moved at least `WEAKNESS_SHIFT` since planning, by id."""

    @property
    def needs_replan(self) -> bool:
        return bool(self.missed_session_ids or self.shifted)


def replan_signal(
    *,
    sessions: Iterable[PlannedSession],
    planned_at: datetime,
    planned_weakness: Mapping[int, float] | None,
    current_weakness: Mapping[int, float],
    now: datetime,
) -> ReplanSignal:
    """Whether an exam's plan has drifted since it was (re)planned at `planned_at`.

    Missed: not done, ended by `now`, and started at or after `planned_at` (sessions already past at the
    last replan were dealt with then). Shifted: Submodules in `current_weakness` (the ones covered now)
    whose score differs from `planned_weakness` by at least `WEAKNESS_SHIFT`; Submodules missing from
    the snapshot, or no snapshot at all, never count.
    """
    missed = tuple(
        s.id
        for s in sorted(sessions, key=lambda s: (s.starts_at, s.id))
        if not s.done and s.starts_at >= planned_at and s.starts_at + timedelta(minutes=s.duration_minutes) <= now
    )
    planned_weakness = planned_weakness or {}
    shifted = tuple(
        WeaknessShift(i, planned_weakness[i], current_weakness[i])
        for i in sorted(current_weakness)
        # Rounded so float noise (0.7 - 0.5 = 0.19999...) doesn't hide a shift of exactly WEAKNESS_SHIFT.
        if i in planned_weakness and round(abs(current_weakness[i] - planned_weakness[i]), 9) >= WEAKNESS_SHIFT
    )
    return ReplanSignal(missed, shifted)
