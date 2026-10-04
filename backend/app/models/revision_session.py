from datetime import datetime

from sqlalchemy import Column, ForeignKey, Table, Text
from sqlalchemy import false as sa_false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

# Which Submodules a RevisionSession revises. Rows go with either side, so deleting a Submodule just
# drops it from the session.
revision_session_submodules = Table(
    "revision_session_submodules",
    Base.metadata,
    Column("revision_session_id", ForeignKey("revision_sessions.id", ondelete="CASCADE"), primary_key=True),
    Column("submodule_id", ForeignKey("submodules.id", ondelete="CASCADE"), primary_key=True),
)


class RevisionSession(Base):
    """One planned block of revision for an exam Assignment, proposed by `crud/revision_planner.py`."""

    __tablename__ = "revision_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("assignments.id", ondelete="CASCADE"), index=True)
    starts_at: Mapped[datetime] = mapped_column(index=True)
    duration_minutes: Mapped[int]
    # AI-written study guidance, generated lazily when the session is first opened (#13). None until then.
    guidance_markdown: Mapped[str | None] = mapped_column(Text)
    done: Mapped[bool] = mapped_column(default=False, server_default=sa_false())

    assignment: Mapped["Assignment"] = relationship(back_populates="revision_sessions")  # noqa: F821
    submodules: Mapped[list["Submodule"]] = relationship(  # noqa: F821
        secondary=revision_session_submodules, order_by="Submodule.title", passive_deletes=True
    )
