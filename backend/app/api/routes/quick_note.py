from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.quick_note import QuickNote
from app.schemas.quick_note import QuickNoteRead, QuickNoteUpdate

router = APIRouter(prefix="/quick-note", tags=["quick-note"])


def _get_or_create(db: Session) -> QuickNote:
    note = db.get(QuickNote, 1)
    if note is None:
        note = QuickNote(id=1, content=None)
        db.add(note)
        db.commit()
        db.refresh(note)
    return note


@router.get("", response_model=QuickNoteRead)
def get_quick_note(db: Session = Depends(get_db)) -> QuickNote:
    return _get_or_create(db)


@router.patch("", response_model=QuickNoteRead)
def update_quick_note(payload: QuickNoteUpdate, db: Session = Depends(get_db)) -> QuickNote:
    note = _get_or_create(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note
