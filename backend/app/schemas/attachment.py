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
