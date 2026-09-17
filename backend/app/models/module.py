from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    code: Mapped[str | None] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(20), default="#6366f1")
    term: Mapped[str | None] = mapped_column(String(50))
    credits: Mapped[int | None]
    created_at: Mapped[datetime] = mapped_column(server_default="now()")

    lectures: Mapped[list["Lecture"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(back_populates="module", cascade="all, delete-orphan")
    flashcards: Mapped[list["Flashcard"]] = relationship(back_populates="module", cascade="all, delete-orphan")


class ModuleLink(Base):
    """Undirected 'related module' relationship, stored as a single directed row per pair."""

    __tablename__ = "module_links"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    related_module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))

    module: Mapped["Module"] = relationship(foreign_keys=[module_id])
    related_module: Mapped["Module"] = relationship(foreign_keys=[related_module_id])
