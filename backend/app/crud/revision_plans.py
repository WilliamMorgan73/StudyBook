"""Gathers the revision planner's inputs from the DB and runs it (see `crud/revision_planner.py`)."""

from collections.abc import Iterable
from datetime import date, datetime, time, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app.crud.busy_time import busy_intervals
from app.crud.revision_planner import (
    NotEnoughTime,
    ProposedSession,
    schedule_revision,
    weakness_scores,
)
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind
from app.models.flashcard import Flashcard, FlashcardReview
from app.models.lecture import Lecture
from app.models.personal_event import PersonalEvent
from app.models.revision_session import RevisionSession

# Lectures and exams saved without a duration still block this long.
DEFAULT_BLOCK_MINUTES = 60


def _span(starts_at: datetime, duration_minutes: int | None) -> tuple[datetime, datetime]:
    return starts_at, starts_at + timedelta(minutes=duration_minutes or DEFAULT_BLOCK_MINUTES)


def blocking_intervals(db: Session, start: datetime, end: datetime, exam_id: int) -> list[tuple[datetime, datetime]]:
    """Everything a session for `exam_id` must avoid within [start, end): every Lecture, busy time
    (personal events), every other exam, and other exams' revision sessions. Not merged or clipped.
    """
    # A day's slack either side catches long or overnight blocks that straddle the range edges.
    lo, hi = start - timedelta(days=1), end + timedelta(days=1)
    lectures = db.scalars(select(Lecture).where(Lecture.scheduled_at >= lo, Lecture.scheduled_at <= hi)).all()
    exams = db.scalars(
        select(Assignment).where(
            Assignment.kind == AssignmentKind.exam,
            Assignment.id != exam_id,
            Assignment.due_at >= lo,
            Assignment.due_at <= hi,
        )
    ).all()
    other_sessions = db.scalars(
        select(RevisionSession).where(
            RevisionSession.assignment_id != exam_id,
            RevisionSession.starts_at >= lo,
            RevisionSession.starts_at <= hi,
        )
    ).all()
    personal_events = db.scalars(
        select(PersonalEvent).where(
            PersonalEvent.valid_from <= end.date(),
            or_(PersonalEvent.valid_until.is_(None), PersonalEvent.valid_until >= start.date() - timedelta(days=1)),
        )
    ).all()
    return (
        [_span(lec.scheduled_at, lec.duration_minutes) for lec in lectures]
        + [_span(exam.due_at, exam.duration_minutes) for exam in exams]
        + [_span(s.starts_at, s.duration_minutes) for s in other_sessions]
        + busy_intervals(personal_events, start, end)
    )


def submodule_weakness(db: Session, submodule_ids: Iterable[int]) -> dict[int, float]:
    """`weakness_scores` over the full review history of the given Submodules' Flashcards."""
    ids = list(submodule_ids)
    reviews = db.scalars(
        select(FlashcardReview)
        .join(FlashcardReview.flashcard)
        .where(Flashcard.submodule_id.in_(ids))
        .options(selectinload(FlashcardReview.flashcard))
    ).all()
    return weakness_scores(reviews, ids)


def plan_exam_revision(
    db: Session,
    exam: Assignment,
    *,
    start_date: date,
    weekdays: Iterable[int],
    session_minutes: int,
    now: datetime,
) -> list[ProposedSession] | NotEnoughTime:
    """Run the scheduler for `exam` (which must have `due_at` and covered Submodules). Writes nothing.

    Sessions start no earlier than `now`, so a plan starting today skips the hours already gone.
    """
    range_start = max(datetime.combine(start_date, time.min), now)
    covered = [s.id for s in exam.covered_submodules]
    return schedule_revision(
        exam_starts_at=exam.due_at,
        submodule_ids=covered,
        weakness=submodule_weakness(db, covered),
        start_date=start_date,
        weekdays=set(weekdays),
        session_minutes=session_minutes,
        blocked=blocking_intervals(db, range_start, exam.due_at, exam.id),
        not_before=now,
    )
