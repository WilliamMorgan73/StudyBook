from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.attachment import AttachmentRead


class SubmoduleBase(BaseModel):
    title: str
    content_markdown: str = ""


class SubmoduleCreate(SubmoduleBase):
    module_id: int


class SubmoduleUpdate(BaseModel):
    title: str | None = None
    content_markdown: str | None = None


class SubmoduleBacklink(BaseModel):
    """A submodule that links to the current one via a [[wikilink]] in its content_markdown."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    module_id: int
    module_name: str


class SubmoduleLinkTarget(BaseModel):
    """Resolved wikilink target, returned by GET /submodules/resolve for click-to-navigate."""

    id: int
    module_id: int


class SubmoduleIndexEntry(BaseModel):
    """Lightweight listing entry for the cross-module wikilink picker — no content_markdown/attachments."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    module_id: int
    module_name: str


class SubmoduleRead(SubmoduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead] = []
    backlinks: list[SubmoduleBacklink] = []
