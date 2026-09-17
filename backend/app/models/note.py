from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AttachmentKind


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    lecture_id: Mapped[int | None] = mapped_column(ForeignKey("lectures.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200))
    content_markdown: Mapped[str] = mapped_column(default="")
    is_quick_note: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(server_default="now()", onupdate="now()")

    module: Mapped["Module"] = relationship(back_populates="notes")  # noqa: F821
    lecture: Mapped["Lecture | None"] = relationship(back_populates="notes")  # noqa: F821
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="note", cascade="all, delete-orphan")
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="note")  # noqa: F821


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"))
    kind: Mapped[AttachmentKind] = mapped_column(Enum(AttachmentKind, native_enum=False))
    filename: Mapped[str] = mapped_column(String(300))
    file_path: Mapped[str] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(server_default="now()")

    note: Mapped["Note"] = relationship(back_populates="attachments")
