from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


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
