from typing import TYPE_CHECKING, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.ai import resolve_api_key
from app.services.ai_models import (
    AI_MODEL_IDS,
    DEFAULT_AI_MODEL,
    AIProvider,
    provider_of,
)

if TYPE_CHECKING:
    from app.models.app_settings import AppSettings

ThemeMode = Literal["light", "dark", "system"]
Skin = Literal["default", "slate", "sepia"]
TableAlignment = Literal["left", "center"]

DASHBOARD_COLUMNS = 12


class DashboardLayoutItem(BaseModel):
    """One Overview widget's place on the 12-column grid. `i` is a frontend widget id."""

    i: str = Field(min_length=1, max_length=32)
    x: int = Field(ge=0, lt=DASHBOARD_COLUMNS)
    y: int = Field(ge=0, le=1000)
    w: int = Field(ge=1, le=DASHBOARD_COLUMNS)
    h: int = Field(ge=1, le=100)

    @model_validator(mode="after")
    def _fits_grid(self) -> "DashboardLayoutItem":
        if self.x + self.w > DASHBOARD_COLUMNS:
            raise ValueError(f"Widget {self.i!r} overflows the {DASHBOARD_COLUMNS}-column grid")
        return self


DashboardLayout = list[DashboardLayoutItem]


class AppSettingsRead(BaseModel):
    """Never carries the API keys; build it with `from_row`, which reports `has_*_api_key`,
    `ai_provider` and `ai_enabled` instead."""

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
    ai_model: str = DEFAULT_AI_MODEL
    # Null: the frontend's default layout.
    dashboard_layout: DashboardLayout | None = None
    # Derived from `ai_model`.
    ai_provider: AIProvider = "anthropic"
    # A key for that provider is saved in the settings row.
    has_anthropic_api_key: bool = False
    has_gemini_api_key: bool = False
    # The selected provider has a key, saved or from the backend environment, so AI actions work.
    ai_enabled: bool = False

    @classmethod
    def from_row(cls, row: "AppSettings") -> "AppSettingsRead":
        read = cls.model_validate(row)
        provider = provider_of(row.ai_model).id
        saved = {"anthropic": row.anthropic_api_key, "gemini": row.gemini_api_key}
        read.ai_provider = provider
        read.has_anthropic_api_key = bool(row.anthropic_api_key)
        read.has_gemini_api_key = bool(row.gemini_api_key)
        read.ai_enabled = resolve_api_key(provider, saved[provider]) is not None
        return read


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
    # Write-only. A non-empty string sets the key; null or "" clears it; omit to leave it unchanged.
    anthropic_api_key: str | None = Field(default=None, max_length=500)
    gemini_api_key: str | None = Field(default=None, max_length=500)
    ai_model: str | None = None
    # A list sets the layout; null resets it to the default; omit to leave it unchanged.
    dashboard_layout: DashboardLayout | None = Field(default=None, max_length=32)

    @field_validator("anthropic_api_key", "gemini_api_key")
    @classmethod
    def _blank_key_clears(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("ai_model")
    @classmethod
    def _known_model(cls, value: str | None) -> str | None:
        if value is not None and value not in AI_MODEL_IDS:
            raise ValueError(f"Unknown model {value!r}")
        return value


class AIModelRead(BaseModel):
    id: str
    label: str
    description: str
    provider: AIProvider


class AIConnectionResult(BaseModel):
    ok: bool
    model: str
