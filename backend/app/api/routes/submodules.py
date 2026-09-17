from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.attachments import store_upload
from app.models.attachment import Attachment
from app.models.submodule import Submodule
from app.schemas.attachment import AttachmentRead
from app.schemas.submodule import SubmoduleCreate, SubmoduleRead, SubmoduleUpdate

router = APIRouter(prefix="/submodules", tags=["submodules"])


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

    kind, filename, file_path = store_upload(file, f"submodules/{submodule_id}")
    attachment = Attachment(submodule_id=submodule_id, kind=kind, filename=filename, file_path=file_path)
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment
