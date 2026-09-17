from datetime import datetime

from pydantic import BaseModel, ConfigDict


class TodoCreate(BaseModel):
    text: str


class TodoUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None


class TodoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    assignment_id: int
    text: str
    done: bool
    created_at: datetime
