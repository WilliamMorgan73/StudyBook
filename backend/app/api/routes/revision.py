from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.clock import local_now
from app.core.database import get_db
from app.crud.calendar_feeds import enabled_feeds, refresh_feeds
from app.crud.revision_planner import NotEnoughTime, split_for_replan, weakest_cards
from app.crud.revision_plans import (
    exam_replan_signal,
    plan_exam_revision,
    save_plan,
    submodule_weakness,
)
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind
from app.models.flashcard import Flashcard
from app.models.revision_session import RevisionSession
from app.schemas.revision import (
    RevisionPlanCreate,
    RevisionPlanStatus,
    RevisionSessionDetail,
    RevisionSessionRead,
    RevisionSessionUpdate,
    SessionTopic,
    ShiftedTopic,
    WeakCard,
)

router = APIRouter(tags=["revision"])

WEAKEST_CARDS_SHOWN = 10


def _get_exam_or_404(db: Session, assignment_id: int) -> Assignment:
    exam = db.get(Assignment, assignment_id)
    if exam is None:
        raise HTTPException(404, "Assignment not found")
    if exam.kind != AssignmentKind.exam:
        raise HTTPException(400, "Only exams have a revision plan")
    return exam


def _get_session_or_404(db: Session, session_id: int) -> RevisionSession:
    session = db.get(RevisionSession, session_id)
    if session is None:
        raise HTTPException(404, "Revision session not found")
    return session


def _check_plan_request(exam: Assignment, payload: RevisionPlanCreate) -> set[int]:
    """The checks planning and replanning share; returns the weekdays."""
    if exam.due_at is None:
        raise HTTPException(400, "Set the exam's date before planning revision")
    if not exam.covered_submodules:
        raise HTTPException(400, "Choose which submodules the exam covers before planning revision")
    weekdays = set(payload.weekdays)
    if not weekdays:
        raise HTTPException(422, "Pick at least one weekday")
    if any(d not in range(7) for d in weekdays):
        raise HTTPException(422, "Weekdays must be 0 (Monday) to 6 (Sunday)")
    if payload.start_date > exam.due_at.date():
        raise HTTPException(422, "The start date must be on or before the exam")
    return weekdays


def _plan_and_save(
    db: Session, exam: Assignment, payload: RevisionPlanCreate, weekdays: set[int], kept: list[RevisionSession]
) -> list[RevisionSessionRead]:
    # Planning always works from the latest calendar feeds; a failed fetch just uses the cached copy.
    refresh_feeds(enabled_feeds(db))
    now = local_now()
    weakness = submodule_weakness(db, [s.id for s in exam.covered_submodules])
    result = plan_exam_revision(
        db,
        exam,
        start_date=payload.start_date,
        weekdays=weekdays,
        session_minutes=payload.session_minutes,
        weakness=weakness,
        now=now,
        kept=kept,
    )
    if isinstance(result, NotEnoughTime):
        raise HTTPException(422, result.message)
    save_plan(exam, result, weakness=weakness, now=now, kept=kept)
    db.commit()
    db.refresh(exam)
    return [RevisionSessionRead.from_row(s) for s in exam.revision_sessions]


@router.post("/assignments/{assignment_id}/revision-plan", response_model=list[RevisionSessionRead], status_code=201)
def create_revision_plan(
    assignment_id: int, payload: RevisionPlanCreate, db: Session = Depends(get_db)
) -> list[RevisionSessionRead]:
    """Schedule and save revision sessions for an exam. 422 with a readable `detail` when they don't fit."""
    exam = _get_exam_or_404(db, assignment_id)
    weekdays = _check_plan_request(exam, payload)
    if exam.revision_sessions:
        raise HTTPException(409, "This exam already has a revision plan")
    return _plan_and_save(db, exam, payload, weekdays, kept=[])


@router.post("/assignments/{assignment_id}/revision-plan/replan", response_model=list[RevisionSessionRead])
def replan_revision(
    assignment_id: int, payload: RevisionPlanCreate, db: Session = Depends(get_db)
) -> list[RevisionSessionRead]:
    """Reschedule an exam's plan: sessions that are done or have started stay, every future not-done one
    is replaced. Returns the whole plan. A 422 (e.g. not enough time) leaves the plan unchanged."""
    exam = _get_exam_or_404(db, assignment_id)
    weekdays = _check_plan_request(exam, payload)
    if not exam.revision_sessions:
        raise HTTPException(409, "This exam has no revision plan to replan")
    now = local_now()
    if exam.due_at <= now:
        raise HTTPException(400, "This exam has already started")
    kept, _replaced = split_for_replan(exam.revision_sessions, now)
    return _plan_and_save(db, exam, payload, weekdays, kept=kept)


@router.get("/assignments/{assignment_id}/revision-plan/status", response_model=RevisionPlanStatus)
def get_revision_plan_status(assignment_id: int, db: Session = Depends(get_db)) -> RevisionPlanStatus:
    """Whether the exam's plan needs replanning: sessions missed, or weak topics shifted since planning."""
    exam = _get_exam_or_404(db, assignment_id)
    now = local_now()
    if not exam.revision_sessions or exam.due_at is None or exam.due_at <= now:
        return RevisionPlanStatus(
            needs_replan=False, planned_at=exam.revision_planned_at, missed_session_ids=[], shifted_topics=[]
        )
    signal = exam_replan_signal(db, exam, now)
    titles = {s.id: s.title for s in exam.covered_submodules}
    return RevisionPlanStatus(
        needs_replan=signal.needs_replan,
        planned_at=exam.revision_planned_at,
        missed_session_ids=list(signal.missed_session_ids),
        shifted_topics=[
            ShiftedTopic(id=s.submodule_id, title=titles[s.submodule_id], planned_weakness=s.planned, weakness=s.current)
            for s in signal.shifted
        ],
    )


@router.delete("/assignments/{assignment_id}/revision-plan", status_code=204)
def delete_revision_plan(assignment_id: int, db: Session = Depends(get_db)) -> None:
    """Remove every session of the exam's plan, done ones included, so it can be planned afresh."""
    exam = _get_exam_or_404(db, assignment_id)
    exam.revision_sessions = []
    exam.revision_planned_at = None
    exam.revision_planned_weakness = None
    db.commit()


@router.get("/revision-sessions", response_model=list[RevisionSessionRead])
def list_revision_sessions(
    assignment_id: int | None = None,
    module_id: int | None = None,
    start: datetime | None = None,
    end: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[RevisionSessionRead]:
    """Sessions sorted by start, optionally for one exam or Module, and/or starting within [start, end]."""
    stmt = (
        select(RevisionSession)
        .join(RevisionSession.assignment)
        .options(selectinload(RevisionSession.submodules))
        .order_by(RevisionSession.starts_at, RevisionSession.id)
    )
    if assignment_id is not None:
        stmt = stmt.where(RevisionSession.assignment_id == assignment_id)
    if module_id is not None:
        stmt = stmt.where(Assignment.module_id == module_id)
    if start is not None:
        stmt = stmt.where(RevisionSession.starts_at >= start)
    if end is not None:
        stmt = stmt.where(RevisionSession.starts_at <= end)
    return [RevisionSessionRead.from_row(s) for s in db.scalars(stmt).all()]


@router.get("/revision-sessions/{session_id}", response_model=RevisionSessionDetail)
def get_revision_session(session_id: int, db: Session = Depends(get_db)) -> RevisionSessionDetail:
    """The session view, with weakness scores and weakest cards computed from the latest reviews."""
    session = _get_session_or_404(db, session_id)
    submodule_ids = [s.id for s in session.submodules]
    weakness = submodule_weakness(db, submodule_ids)
    cards = db.scalars(
        select(Flashcard).where(Flashcard.submodule_id.in_(submodule_ids)).options(selectinload(Flashcard.reviews))
    ).all()
    return RevisionSessionDetail(
        **RevisionSessionRead.from_row(session).model_dump(),
        topics=[SessionTopic(id=s.id, title=s.title, weakness=weakness[s.id]) for s in session.submodules],
        weakest_cards=[
            WeakCard(
                id=w.flashcard.id,
                submodule_id=w.flashcard.submodule_id,
                front=w.flashcard.front,
                back=w.flashcard.back,
                lapse_rate=w.lapse_rate,
                review_count=w.review_count,
            )
            for w in weakest_cards(cards, limit=WEAKEST_CARDS_SHOWN)
        ],
    )


@router.patch("/revision-sessions/{session_id}", response_model=RevisionSessionRead)
def update_revision_session(
    session_id: int, payload: RevisionSessionUpdate, db: Session = Depends(get_db)
) -> RevisionSessionRead:
    session = _get_session_or_404(db, session_id)
    if payload.done is not None:
        session.done = payload.done
    db.commit()
    db.refresh(session)
    return RevisionSessionRead.from_row(session)
