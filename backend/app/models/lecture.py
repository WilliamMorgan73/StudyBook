from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Lecture(Base):
    __tablename__ = "lectures"

    id: Mapped[int] = mapped_column(primary_key=True)
    module_id: Mapped[int] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    scheduled_at: Mapped[datetime]
    duration_minutes: Mapped[int | None]
    location: Mapped[str | None] = mapped_column(String(200))
    week_number: Mapped[int | None]

    module: Mapped["Module"] = relationship(back_populates="lectures")  # noqa: F821
