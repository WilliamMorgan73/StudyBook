from pydantic import BaseModel, ConfigDict


class AppSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    max_credits: int | None = None


class AppSettingsUpdate(BaseModel):
    max_credits: int | None = None
