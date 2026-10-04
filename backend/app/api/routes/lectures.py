from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.lecture import Lecture
from app.models.submodule import Submodule
from app.schemas.lecture import (
    LectureCreate,
    LectureRead,
    LecturesSubmodulesUpdate,
    LectureUpdate,
)

router = APIRouter(prefix="/lectures", tags=["lectures"])


def _check_editable(lecture: Lecture) -> None:
    """Lectures synced from a calendar feed belong to the feed; the next sync would undo any edit.
    Their Submodules are StudyBook's own, so those stay editable."""
    if lecture.feed_id is not None:
        raise HTTPException(
            409, f"This lecture comes from the calendar '{lecture.feed.name}'. Change it in Settings → Calendars."
        )


def _lecture_submodules(db: Session, module_id: int, submodule_ids: list[int]) -> list[Submodule]:
    """Load the given Submodules, rejecting any that don't exist or belong to another Module."""
    if not submodule_ids:
        return []
    submodules = list(db.scalars(select(Submodule).where(Submodule.id.in_(submodule_ids))).all())
    if len(submodules) != len(set(submodule_ids)) or any(s.module_id != module_id for s in submodules):
        raise HTTPException(422, "A lecture's submodules must belong to its module")
    return submodules


@router.get("", response_model=list[LectureRead])
def list_lectures(module_id: int | None = None, db: Session = Depends(get_db)) -> list[Lecture]:
    stmt = select(Lecture).order_by(Lecture.scheduled_at.asc())
    if module_id is not None:
        stmt = stmt.where(Lecture.module_id == module_id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=LectureRead, status_code=201)
def create_lecture(payload: LectureCreate, db: Session = Depends(get_db)) -> Lecture:
    lecture = Lecture(**payload.model_dump(exclude={"submodule_ids"}))
    lecture.submodules = _lecture_submodules(db, payload.module_id, payload.submodule_ids)
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return lecture


@router.put("/submodules", response_model=list[LectureRead])
def set_lectures_submodules(payload: LecturesSubmodulesUpdate, db: Session = Depends(get_db)) -> list[Lecture]:
    """Applies one set of Submodules to many lectures of one Module at once (e.g. every Wednesday's),
    replacing what each had."""
    ids = set(payload.lecture_ids)
    lectures = list(db.scalars(select(Lecture).where(Lecture.id.in_(ids)).order_by(Lecture.scheduled_at)).all())
    if not ids or len(lectures) != len(ids):
        raise HTTPException(422, "Unknown lecture")
    module_ids = {lecture.module_id for lecture in lectures}
    if len(module_ids) > 1:
        raise HTTPException(422, "The lectures must all belong to one module")
    submodules = _lecture_submodules(db, module_ids.pop(), payload.submodule_ids)
    for lecture in lectures:
        lecture.submodules = list(submodules)
    db.commit()
    return lectures


@router.get("/{lecture_id}", response_model=LectureRead)
def get_lecture(lecture_id: int, db: Session = Depends(get_db)) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "Lecture not found")
    return lecture


@router.patch("/{lecture_id}", response_model=LectureRead)
def update_lecture(lecture_id: int, payload: LectureUpdate, db: Session = Depends(get_db)) -> Lecture:
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "Lecture not found")
    updates = payload.model_dump(exclude_unset=True)
    submodule_ids = updates.pop("submodule_ids", None)
    if updates:
        _check_editable(lecture)
    if submodule_ids is not None:
        lecture.submodules = _lecture_submodules(db, lecture.module_id, submodule_ids)
    for field, value in updates.items():
        setattr(lecture, field, value)
    db.commit()
    db.refresh(lecture)
    return lecture


@router.delete("/{lecture_id}", status_code=204)
def delete_lecture(lecture_id: int, db: Session = Depends(get_db)) -> None:
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "Lecture not found")
    _check_editable(lecture)
    db.delete(lecture)
    db.commit()
