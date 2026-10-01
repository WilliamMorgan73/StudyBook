from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.spaced_repetition import review_card
from app.models.flashcard import Flashcard
from app.schemas.flashcard import FlashcardCreate, FlashcardRead, FlashcardReviewCreate

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.get("", response_model=list[FlashcardRead])
def list_flashcards(
    module_id: int | None = None, submodule_id: int | None = None, db: Session = Depends(get_db)
) -> list[Flashcard]:
    stmt = select(Flashcard)
    if module_id is not None:
        stmt = stmt.where(Flashcard.module_id == module_id)
    if submodule_id is not None:
        stmt = stmt.where(Flashcard.submodule_id == submodule_id)
    return list(db.scalars(stmt).all())


@router.get("/due", response_model=list[FlashcardRead])
def list_due(
    module_id: int | None = None, submodule_id: int | None = None, db: Session = Depends(get_db)
) -> list[Flashcard]:
    stmt = select(Flashcard).where(Flashcard.due_at <= datetime.now(UTC).replace(tzinfo=None))
    if module_id is not None:
        stmt = stmt.where(Flashcard.module_id == module_id)
    if submodule_id is not None:
        stmt = stmt.where(Flashcard.submodule_id == submodule_id)
    return list(db.scalars(stmt.order_by(Flashcard.due_at, Flashcard.id)).all())


@router.post("", response_model=FlashcardRead, status_code=201)
def create_flashcard(payload: FlashcardCreate, db: Session = Depends(get_db)) -> Flashcard:
    card = Flashcard(**payload.model_dump())
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.post("/{flashcard_id}/review", response_model=FlashcardRead)
def review_flashcard(flashcard_id: int, payload: FlashcardReviewCreate, db: Session = Depends(get_db)) -> Flashcard:
    card = db.get(Flashcard, flashcard_id)
    if card is None:
        raise HTTPException(404, "Flashcard not found")
    db.add(review_card(card, payload.quality))
    db.commit()
    db.refresh(card)
    return card


@router.delete("/{flashcard_id}", status_code=204)
def delete_flashcard(flashcard_id: int, db: Session = Depends(get_db)) -> None:
    card = db.get(Flashcard, flashcard_id)
    if card is None:
        raise HTTPException(404, "Flashcard not found")
    db.delete(card)
    db.commit()
