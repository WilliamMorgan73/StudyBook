from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuickTodo(Base):
    """A standalone to-do item: General (module_id null), or one module's own list on its page. The
    Overview's To-do widget shows them all, grouped by module."""

    __tablename__ = "quick_todos"

    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(300))
    done: Mapped[bool] = mapped_column(default=False)
    module_id: Mapped[int | None] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
