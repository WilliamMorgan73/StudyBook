from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuickNote(Base):
    """Single-row table (id is always 1) for the Overview page's freeform notepad. Single-user app, no auth."""

    __tablename__ = "quick_note"

    id: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[str | None] = mapped_column(Text)
