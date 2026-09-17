from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AppSettings(Base):
    """Single-row table (id is always 1) for app-wide settings. Single-user app, no auth."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    max_credits: Mapped[int | None]
