from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import AttachmentKind


class AttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    submodule_id: int | None
    assignment_id: int | None
    kind: AttachmentKind
    filename: str
    file_path: str
    url: str
    uploaded_at: datetime
    text_extractable: bool


class AttachmentExtractedText(BaseModel):
    attachment_id: int
    kind: AttachmentKind
    markdown: str
    near_empty: bool
