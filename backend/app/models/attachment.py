from datetime import datetime

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
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

    submodule: Mapped["Submodule | None"] = relationship(back_populates="attachments")  # noqa: F821
    assignment: Mapped["Assignment | None"] = relationship(back_populates="attachments")  # noqa: F821

    @property
    def url(self) -> str:
        return f"/{self.file_path}"
