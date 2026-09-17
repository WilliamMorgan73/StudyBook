from pydantic import BaseModel, ConfigDict


class QuickNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    content: str | None = None


class QuickNoteUpdate(BaseModel):
    content: str | None = None
