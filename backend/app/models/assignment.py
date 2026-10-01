from datetime import datetime

from sqlalchemy import Column, Enum, ForeignKey, Numeric, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AssignmentKind, AssignmentStatus

# Which Submodules an Assignment covers. Rows go with either side, so deleting a Submodule just drops it from the list.
assignment_submodules = Table(
    "assignment_submodules",
    Base.metadata,
    Column("assignment_id", ForeignKey("assignments.id", ondelete="CASCADE"), primary_key=True),
    Column("submodule_id", ForeignKey("submodules.id", ondelete="CASCADE"), primary_key=True),
)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None]
    due_at: Mapped[datetime | None]
    status: Mapped[AssignmentStatus] = mapped_column(
        Enum(AssignmentStatus, native_enum=False), default=AssignmentStatus.not_started
    )
    weight_percent: Mapped[float] = mapped_column(Numeric(5, 2))
    grade_earned: Mapped[float | None] = mapped_column(Numeric(6, 2))
    grade_max: Mapped[float | None] = mapped_column(Numeric(6, 2))
    notes_markdown: Mapped[str] = mapped_column(default="")
    kind: Mapped[AssignmentKind] = mapped_column(
        Enum(AssignmentKind, native_enum=False), default=AssignmentKind.coursework, server_default="coursework"
    )
    # Exam-only; for exams `due_at` is the exam start.
    duration_minutes: Mapped[int | None]
    location: Mapped[str | None] = mapped_column(String(200))

    module: Mapped["Module"] = relationship(back_populates="assignments")  # noqa: F821
    attachments: Mapped[list["Attachment"]] = relationship(back_populates="assignment", cascade="all, delete-orphan")  # noqa: F821
    covered_submodules: Mapped[list["Submodule"]] = relationship(  # noqa: F821
        secondary=assignment_submodules, order_by="Submodule.title", passive_deletes=True
    )
    todos: Mapped[list["AssignmentTodo"]] = relationship(  # noqa: F821
        back_populates="assignment", cascade="all, delete-orphan", order_by="AssignmentTodo.id"
    )
