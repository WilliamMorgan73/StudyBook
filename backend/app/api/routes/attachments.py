from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.attachment_text import (
    AttachmentExtractionFailedError,
    AttachmentNotExtractableError,
    get_extracted_text,
)
from app.models.attachment import Attachment
from app.schemas.attachment import AttachmentExtractedText

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.get("/{attachment_id}/extracted-text", response_model=AttachmentExtractedText)
def read_extracted_text(attachment_id: int, db: Session = Depends(get_db)) -> AttachmentExtractedText:
    """The Attachment's text as AI features receive it; converts and caches on first request."""
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    try:
        extracted = get_extracted_text(attachment)
    except AttachmentNotExtractableError as exc:
        raise HTTPException(415, str(exc)) from exc
    except AttachmentExtractionFailedError as exc:
        raise HTTPException(422, f"Could not extract text from this file: {exc}") from exc
    if db.is_modified(attachment):
        db.commit()
    return AttachmentExtractedText(
        attachment_id=attachment.id,
        kind=attachment.kind,
        markdown=extracted.markdown,
        near_empty=extracted.near_empty,
    )


@router.delete("/{attachment_id}", status_code=204)
def delete_attachment(attachment_id: int, db: Session = Depends(get_db)) -> None:
    attachment = db.get(Attachment, attachment_id)
    if attachment is None:
        raise HTTPException(404, "Attachment not found")
    Path(attachment.file_path).unlink(missing_ok=True)
    db.delete(attachment)
    db.commit()
