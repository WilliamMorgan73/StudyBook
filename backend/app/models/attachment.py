from datetime import datetime
from pathlib import Path

from sqlalchemy import Enum, ForeignKey, String, Text, event
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship

from app.core.database import Base
from app.crud.attachments import remove_stored_file
from app.models.enums import AttachmentKind


class Attachment(Base):
    """A file (PDF/PPTX/video/audio/image) attached to exactly one of Submodule or Assignment."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    submodule_id: Mapped[int | None] = mapped_column(ForeignKey("submodules.id", ondelete="CASCADE"))
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"))
    kind: Mapped[AttachmentKind] = mapped_column(Enum(AttachmentKind, native_enum=False))
    filename: Mapped[str] = mapped_column(String(300))
    file_path: Mapped[str] = mapped_column(String(500))
    uploaded_at: Mapped[datetime] = mapped_column(server_default="now()")
    # Cache of the local PDF/PPTX -> markdown conversion (app/crud/attachment_text.py); None = not converted yet.
    # Deferred so Attachment lists in submodule/assignment payloads don't load it.
    extracted_markdown: Mapped[str | None] = mapped_column(Text, deferred=True)

    submodule: Mapped["Submodule | None"] = relationship(back_populates="attachments")  # noqa: F821
    assignment: Mapped["Assignment | None"] = relationship(back_populates="attachments")  # noqa: F821

    @property
    def url(self) -> str:
        return f"/{self.file_path}"

    @property
    def size_bytes(self) -> int | None:
        """The stored file's size, read from disk; None if the file has gone missing."""
        try:
            return Path(self.file_path).stat().st_size
        except OSError:
            return None

    @property
    def text_extractable(self) -> bool:
        from app.crud.attachment_text import is_extractable

        return is_extractable(self.kind, self.filename)


# An Attachment's file goes with its row, however the row goes: deleted directly, or through a
# Submodule/Assignment/Module delete cascading to it (the ORM loads and deletes those rows, so they
# show up here). Files are removed only once the delete commits; a rollback keeps them. Bulk
# `query.delete()` and DB-level ON DELETE CASCADE alone bypass the ORM and would orphan files.
_FILES_TO_REMOVE = "attachment_files_to_remove"


@event.listens_for(Session, "after_flush")
def _collect_deleted_attachment_files(session: Session, _flush_context) -> None:
    paths = [obj.file_path for obj in session.deleted if isinstance(obj, Attachment)]
    if paths:
        session.info.setdefault(_FILES_TO_REMOVE, []).extend(paths)


@event.listens_for(Session, "after_commit")
def _remove_deleted_attachment_files(session: Session) -> None:
    for path in session.info.pop(_FILES_TO_REMOVE, []):
        remove_stored_file(path)


@event.listens_for(Session, "after_rollback")
def _keep_files_on_rollback(session: Session) -> None:
    session.info.pop(_FILES_TO_REMOVE, None)
