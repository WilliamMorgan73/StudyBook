import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.enums import AttachmentKind
from app.models.submodule import Attachment, Submodule
from app.schemas.submodule import (
    AttachmentRead,
    SubmoduleCreate,
    SubmoduleRead,
    SubmoduleUpdate,
)

router = APIRouter(prefix="/submodules", tags=["submodules"])

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


@router.post("", response_model=SubmoduleRead, status_code=201)
def create_submodule(payload: SubmoduleCreate, db: Session = Depends(get_db)) -> Submodule:
    submodule = Submodule(**payload.model_dump())
    db.add(submodule)
    db.commit()
    db.refresh(submodule)
    return submodule


@router.get("/{submodule_id}", response_model=SubmoduleRead)
def get_submodule(submodule_id: int, db: Session = Depends(get_db)) -> Submodule:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    return submodule


@router.patch("/{submodule_id}", response_model=SubmoduleRead)
def update_submodule(submodule_id: int, payload: SubmoduleUpdate, db: Session = Depends(get_db)) -> Submodule:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(submodule, field, value)
    db.commit()
    db.refresh(submodule)
    return submodule


@router.delete("/{submodule_id}", status_code=204)
def delete_submodule(submodule_id: int, db: Session = Depends(get_db)) -> None:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    db.delete(submodule)
    db.commit()


@router.post("/{submodule_id}/attachments", response_model=AttachmentRead, status_code=201)
def upload_attachment(submodule_id: int, file: UploadFile, db: Session = Depends(get_db)) -> Attachment:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")

    suffix = Path(file.filename or "").suffix.lower()
    kind = _EXTENSION_KIND.get(suffix, AttachmentKind.other)

    upload_dir = Path(settings.upload_dir) / str(submodule_id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    dest = upload_dir / stored_name
    with dest.open("wb") as out:
        shutil.copyfileobj(file.file, out)

    attachment = Attachment(
        submodule_id=submodule_id,
        kind=kind,
        filename=file.filename or stored_name,
        file_path=str(dest),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment
