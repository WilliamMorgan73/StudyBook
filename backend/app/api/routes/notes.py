import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.enums import AttachmentKind
from app.models.note import Attachment, Note
from app.schemas.note import AttachmentRead, NoteCreate, NoteRead, NoteUpdate

router = APIRouter(prefix="/notes", tags=["notes"])

_EXTENSION_KIND = {
    ".pdf": AttachmentKind.pdf,
    ".ppt": AttachmentKind.pptx,
    ".pptx": AttachmentKind.pptx,
    ".mp4": AttachmentKind.video,
    ".mov": AttachmentKind.video,
    ".mp3": AttachmentKind.audio,
    ".wav": AttachmentKind.audio,
    ".m4a": AttachmentKind.audio,
    ".png": AttachmentKind.image,
    ".jpg": AttachmentKind.image,
    ".jpeg": AttachmentKind.image,
}


@router.post("", response_model=NoteRead, status_code=201)
def create_note(payload: NoteCreate, db: Session = Depends(get_db)) -> Note:
    note = Note(**payload.model_dump())
    db.add(note)
    db.commit()
    db.refresh(note)
    return note


@router.get("/{note_id}", response_model=NoteRead)
def get_note(note_id: int, db: Session = Depends(get_db)) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(note_id: int, payload: NoteUpdate, db: Session = Depends(get_db)) -> Note:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "Note not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(note, field, value)
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int, db: Session = Depends(get_db)) -> None:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "Note not found")
    db.delete(note)
    db.commit()


@router.post("/{note_id}/attachments", response_model=AttachmentRead, status_code=201)
def upload_attachment(note_id: int, file: UploadFile, db: Session = Depends(get_db)) -> Attachment:
    note = db.get(Note, note_id)
    if note is None:
        raise HTTPException(404, "Note not found")

    suffix = Path(file.filename or "").suffix.lower()
    kind = _EXTENSION_KIND.get(suffix, AttachmentKind.other)

    upload_dir = Path(settings.upload_dir) / str(note_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest = upload_dir / stored_name
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    attachment = Attachment(
        note_id=note_id,
        kind=kind,
        filename=file.filename or stored_name,
        file_path=str(dest),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment
