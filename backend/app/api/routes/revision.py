from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.clock import local_now
from app.core.database import get_db
from app.crud.revision_planner import NotEnoughTime, weakest_cards
from app.crud.revision_plans import plan_exam_revision, submodule_weakness
from app.models.assignment import Assignment
from app.models.enums import AssignmentKind
from app.models.flashcard import Flashcard
from app.models.revision_session import RevisionSession
from app.schemas.revision import (
    RevisionPlanCreate,
    RevisionSessionDetail,
    RevisionSessionRead,
    RevisionSessionUpdate,
    SessionTopic,
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


@router.post("/assignments/{assignment_id}/revision-plan", response_model=list[RevisionSessionRead], status_code=201)
def create_revision_plan(
    assignment_id: int, payload: RevisionPlanCreate, db: Session = Depends(get_db)
) -> list[RevisionSessionRead]:
    """Schedule and save revision sessions for an exam. 422 with a readable `detail` when they don't fit."""
    exam = _get_exam_or_404(db, assignment_id)
    if exam.due_at is None:
        raise HTTPException(400, "Set the exam's date before planning revision")
    if not exam.covered_submodules:
        raise HTTPException(400, "Choose which submodules the exam covers before planning revision")
    if exam.revision_sessions:
        raise HTTPException(409, "This exam already has a revision plan")
    weekdays = set(payload.weekdays)
    if not weekdays:
        raise HTTPException(422, "Pick at least one weekday")
    if any(d not in range(7) for d in weekdays):
        raise HTTPException(422, "Weekdays must be 0 (Monday) to 6 (Sunday)")
    if payload.start_date > exam.due_at.date():
        raise HTTPException(422, "The start date must be on or before the exam")

    result = plan_exam_revision(
        db,
        exam,
        start_date=payload.start_date,
        weekdays=weekdays,
        session_minutes=payload.session_minutes,
        now=local_now(),
    )
    if isinstance(result, NotEnoughTime):
        raise HTTPException(422, result.message)

    submodules = {s.id: s for s in exam.covered_submodules}
    exam.revision_sessions = [
        RevisionSession(
            starts_at=p.starts_at,
            duration_minutes=p.duration_minutes,
            submodules=[submodules[i] for i in p.submodule_ids],
        )
        for p in result
    ]
    db.commit()
    db.refresh(exam)
    return [RevisionSessionRead.from_row(s) for s in exam.revision_sessions]


@router.delete("/assignments/{assignment_id}/revision-plan", status_code=204)
def delete_revision_plan(assignment_id: int, db: Session = Depends(get_db)) -> None:
    """Remove every session of the exam's plan, done ones included, so it can be planned afresh."""
    exam = _get_exam_or_404(db, assignment_id)
    exam.revision_sessions = []
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
