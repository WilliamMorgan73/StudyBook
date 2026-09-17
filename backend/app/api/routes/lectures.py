from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.lecture import Lecture
from app.schemas.lecture import LectureCreate, LectureRead

router = APIRouter(prefix="/lectures", tags=["lectures"])


@router.post("", response_model=LectureRead, status_code=201)
def create_lecture(payload: LectureCreate, db: Session = Depends(get_db)) -> Lecture:
    lecture = Lecture(**payload.model_dump())
    db.add(lecture)
    db.commit()
    db.refresh(lecture)
    return lecture
