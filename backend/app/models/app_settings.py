from sqlalchemy import JSON, String, Text
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
    # Write-only over the API: never serialised back, only reported as `has_anthropic_api_key` /
    # `has_gemini_api_key`. Stored in plain text; this is a local single-user database.
    anthropic_api_key: Mapped[str | None] = mapped_column(Text)
    gemini_api_key: Mapped[str | None] = mapped_column(Text)
    # Also decides the provider (`services/ai_models.py::provider_of`).
    ai_model: Mapped[str] = mapped_column(String(64), default=DEFAULT_AI_MODEL)
    # Overview widget placement: a list of {i, x, y, w, h} grid items (react-grid-layout shape).
    # Null means the frontend's default layout. Widget ids are owned by the frontend
    # (frontend/src/lib/dashboardLayout.ts), so they aren't validated here.
    dashboard_layout: Mapped[list | None] = mapped_column(JSON)
