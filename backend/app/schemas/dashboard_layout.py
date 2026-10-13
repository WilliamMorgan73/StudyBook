import json
from typing import Any

from pydantic import (
    BaseModel,
    Field,
    SerializerFunctionWrapHandler,
    model_serializer,
    model_validator,
)

DASHBOARD_COLUMNS = 12
# Widget settings are a few small fields (a time zone, an image id), never content.
MAX_CONFIG_CHARS = 4096


class DashboardLayoutItem(BaseModel):
    """One widget's place on a 12-column dashboard grid (the Overview, or a module page). `i` is the
    widget's instance id, `type` its frontend widget id (missing on layouts saved before a widget
    could be placed twice, where `i` is the type), and `config` its own settings. The backend only
    checks the shape."""

    i: str = Field(min_length=1, max_length=32)
    type: str | None = Field(default=None, min_length=1, max_length=32)
    config: dict[str, Any] | None = None
    x: int = Field(ge=0, lt=DASHBOARD_COLUMNS)
    y: int = Field(ge=0, le=1000)
    w: int = Field(ge=1, le=DASHBOARD_COLUMNS)
    h: int = Field(ge=1, le=100)

    @model_validator(mode="after")
    def _fits_grid(self) -> "DashboardLayoutItem":
        if self.x + self.w > DASHBOARD_COLUMNS:
            raise ValueError(f"Widget {self.i!r} overflows the {DASHBOARD_COLUMNS}-column grid")
        if self.config is not None and len(json.dumps(self.config)) > MAX_CONFIG_CHARS:
            raise ValueError(f"Widget {self.i!r} has more than {MAX_CONFIG_CHARS} characters of settings")
        return self

    @model_serializer(mode="wrap")
    def _omit_empty(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        # Old layouts read back exactly as they were saved, without `"type": null`.
        return {k: v for k, v in handler(self).items() if not (k in ("type", "config") and v is None)}


DashboardLayout = list[DashboardLayoutItem]
