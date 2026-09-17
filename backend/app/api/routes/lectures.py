from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.lecture import Lecture
from app.schemas.lecture import LectureCreate, LectureRead, LectureUpdate

router = APIRouter(prefix="/lectures", tags=["lectures"])


@router.get("", response_model=list[LectureRead])
def list_lectures(module_id: int | None = None, db: Session = Depends(get_db)) -> list[Lecture]:
    stmt = select(Lecture).order_by(Lecture.scheduled_at.asc())
    if module_id is not None:
        stmt = stmt.where(Lecture.module_id == module_id)
    return list(db.scalars(stmt).all())


@router.post("", response_model=LectureRead, status_code=201)
def create_lecture(payload: LectureCreate, db: Session = Depends(get_db)) -> Lecture:
    lecture = Lecture(**payload.model_dump())
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return lecture


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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lecture, field, value)
    db.commit()
    db.refresh(lecture)
    return lecture


@router.delete("/{lecture_id}", status_code=204)
def delete_lecture(lecture_id: int, db: Session = Depends(get_db)) -> None:
    lecture = db.get(Lecture, lecture_id)
    if lecture is None:
        raise HTTPException(404, "Lecture not found")
    db.delete(lecture)
    db.commit()
