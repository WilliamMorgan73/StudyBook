from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.services.ai_models import DEFAULT_AI_MODEL


class AppSettings(Base):
    """Single-row table (id is always 1) for app-wide settings. Single-user app, no auth."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    max_credits: Mapped[int | None]
    theme_mode: Mapped[str] = mapped_column(String(10), default="system")
    skin: Mapped[str] = mapped_column(String(20), default="default")
    table_alignment: Mapped[str] = mapped_column(String(10), default="left")
    note_font_size: Mapped[int] = mapped_column(default=15)
    # CodeMirror keymap-string format (e.g. "Mod-b", "Mod-Shift-k") — see
    # frontend/src/components/MarkdownEditor.tsx's formattingKeymap.
    keybind_bold: Mapped[str] = mapped_column(String(20), default="Mod-b")
    keybind_italic: Mapped[str] = mapped_column(String(20), default="Mod-i")
    keybind_code: Mapped[str] = mapped_column(String(20), default="Mod-e")
    keybind_wikilink: Mapped[str] = mapped_column(String(20), default="Mod-Shift-k")
    # Write-only over the API: never serialised back, only reported as `has_api_key`.
    # Stored in plain text; this is a local single-user database.
    anthropic_api_key: Mapped[str | None] = mapped_column(Text)
    ai_model: Mapped[str] = mapped_column(String(64), default=DEFAULT_AI_MODEL)
