from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Submodule(Base):
    """A topic within a module: written notes, flashcards, and lecture-slide attachments."""

    __tablename__ = "submodules"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    content_markdown: Mapped[str] = mapped_column(default="")
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()", onupdate="now()")

    module: Mapped["Module"] = relationship(back_populates="submodules")  # noqa: F821
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="submodule", cascade="all, delete-orphan")  # noqa: F821
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="submodule")  # noqa: F821
