from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import AssignmentStatus


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

    module: Mapped["Module"] = relationship(back_populates="assignments")  # noqa: F821
