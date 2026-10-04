from pydantic import BaseModel, Field, model_validator

DASHBOARD_COLUMNS = 12


class DashboardLayoutItem(BaseModel):
    """One widget's place on a 12-column dashboard grid (the Overview, or a module page). `i` is a
    frontend widget id; the backend only checks the shape."""

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
