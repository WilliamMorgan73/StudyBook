from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AttachmentKind


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    note_id: int
    kind: AttachmentKind
    filename: str
    file_path: str
    uploaded_at: datetime


class NoteBase(BaseModel):
    title: str
    content_markdown: str = ""
    is_quick_note: bool = False
    lecture_id: int | None = None


class NoteCreate(NoteBase):
    module_id: int


class NoteUpdate(BaseModel):
    title: str | None = None
    content_markdown: str | None = None
    lecture_id: int | None = None


class NoteRead(NoteBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    module_id: int
    created_at: datetime
    updated_at: datetime
    attachments: list[AttachmentRead] = []
