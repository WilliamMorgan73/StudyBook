from datetime import datetime

from pydantic import BaseModel, ConfigDict


class QuickTodoCreate(BaseModel):
    text: str
    # Null: a General to-do.
    module_id: int | None = None


class QuickTodoUpdate(BaseModel):
    text: str | None = None
    done: bool | None = None


class QuickTodoRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    text: str
    done: bool
    module_id: int | None
    created_at: datetime
