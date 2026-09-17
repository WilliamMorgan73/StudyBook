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


class SubmoduleRead(SubmoduleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead] = []
