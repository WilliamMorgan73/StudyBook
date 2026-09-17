from typing import Literal

from pydantic import BaseModel, ConfigDict

ThemeMode = Literal["light", "dark", "system"]
Skin = Literal["default", "slate", "sepia"]


class AppSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    max_credits: int | None = None
    theme_mode: ThemeMode = "system"
    skin: Skin = "default"


class AppSettingsUpdate(BaseModel):
    max_credits: int | None = None
    theme_mode: ThemeMode | None = None
    skin: Skin | None = None
