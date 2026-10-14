from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.undo import UndoConflictError, UndoNotFoundError, undo_delete

router = APIRouter(prefix="/undo", tags=["undo"])


@router.post("/{token}", status_code=204)
def undo(token: str, db: Session = Depends(get_db)) -> None:
    """Put back what a delete removed, while its undo lasts."""
    try:
        undo_delete(db, token)
    except UndoNotFoundError:
        raise HTTPException(404, "This can no longer be undone.") from None
    except UndoConflictError as exc:
        raise HTTPException(409, str(exc)) from None
