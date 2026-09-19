from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

ThemeMode = Literal["light", "dark", "system"]
Skin = Literal["default", "slate", "sepia"]
TableAlignment = Literal["left", "center"]


class AppSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    max_credits: int | None = None
    theme_mode: ThemeMode = "system"
    skin: Skin = "default"
    table_alignment: TableAlignment = "left"
    note_font_size: int = 15
    keybind_bold: str = "Mod-b"
    keybind_italic: str = "Mod-i"
    keybind_code: str = "Mod-e"
    keybind_wikilink: str = "Mod-Shift-k"


class AppSettingsUpdate(BaseModel):
    max_credits: int | None = None
    theme_mode: ThemeMode | None = None
    skin: Skin | None = None
    table_alignment: TableAlignment | None = None
    note_font_size: int | None = Field(default=None, ge=10, le=32)
    keybind_bold: str | None = Field(default=None, min_length=1, max_length=20)
    keybind_italic: str | None = Field(default=None, min_length=1, max_length=20)
    keybind_code: str | None = Field(default=None, min_length=1, max_length=20)
    keybind_wikilink: str | None = Field(default=None, min_length=1, max_length=20)
