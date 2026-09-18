from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.crud.attachments import store_upload
from app.crud.submodule_links import (
    get_backlinks,
    resolve_wikilink,
    sync_outgoing_links,
)
from app.models.attachment import Attachment
from app.models.module import Module
from app.models.submodule import Submodule
from app.schemas.attachment import AttachmentRead
from app.schemas.submodule import (
    SubmoduleCreate,
    SubmoduleIndexEntry,
    SubmoduleLinkTarget,
    SubmoduleRead,
    SubmoduleUpdate,
)

router = APIRouter(prefix="/submodules", tags=["submodules"])


@router.get("", response_model=list[SubmoduleIndexEntry])
def list_submodules(search: str | None = None, db: Session = Depends(get_db)) -> list[SubmoduleIndexEntry]:
    """Lightweight cross-module listing (no content_markdown/attachments) for the wikilink picker."""
    query = select(Submodule.id, Submodule.title, Submodule.module_id, Module.name.label("module_name")).join(Module)
    if search:
        query = query.where(Submodule.title.ilike(f"%{search}%"))
    rows = db.execute(query.order_by(Submodule.title)).all()
    return [
        SubmoduleIndexEntry(id=r.id, title=r.title, module_id=r.module_id, module_name=r.module_name) for r in rows
    ]


@router.get("/resolve", response_model=SubmoduleLinkTarget)
def resolve_submodule_link(title: str, module_id: int, db: Session = Depends(get_db)) -> SubmoduleLinkTarget:
    target = resolve_wikilink(db, title, module_id)
    if target is None:
        raise HTTPException(404, "No submodule matches that wikilink")
    return SubmoduleLinkTarget(id=target.id, module_id=target.module_id)


@router.post("", response_model=SubmoduleRead, status_code=201)
def create_submodule(payload: SubmoduleCreate, db: Session = Depends(get_db)) -> Submodule:
    submodule = Submodule(**payload.model_dump())
    db.add(submodule)
    db.commit()
    db.refresh(submodule)
    sync_outgoing_links(db, submodule)
    return submodule


@router.get("/{submodule_id}", response_model=SubmoduleRead)
def get_submodule(submodule_id: int, db: Session = Depends(get_db)) -> Submodule:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    return SubmoduleRead.model_validate(
        {
            **SubmoduleRead.model_validate(submodule).model_dump(),
            "backlinks": [
                {"id": b.id, "title": b.title, "module_id": b.module_id, "module_name": b.module.name}
                for b in get_backlinks(db, submodule_id)
            ],
        }
    )


@router.patch("/{submodule_id}", response_model=SubmoduleRead)
def update_submodule(submodule_id: int, payload: SubmoduleUpdate, db: Session = Depends(get_db)) -> Submodule:
    submodule = db.get(Submodule, submodule_id)
    if submodule is None:
        raise HTTPException(404, "Submodule not found")
    fields_set = payload.model_dump(exclude_unset=True)
    for field, value in fields_set.items():
        setattr(submodule, field, value)
    db.commit()
    db.refresh(submodule)
    if "content_markdown" in fields_set:
        sync_outgoing_links(db, submodule)
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
