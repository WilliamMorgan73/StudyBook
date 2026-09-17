from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QuickTodoCreate(BaseModel):
    text: str


class QuickTodoUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None


class QuickTodoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    done: bool
    created_at: datetime
