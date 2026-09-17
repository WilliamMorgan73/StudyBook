from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.attachment import Attachment

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)) -> None:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    Path(attachment.file_path).unlink(missing_ok=True)
    db.delete(attachment)
    db.commit()
