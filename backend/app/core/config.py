from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://studybook:studybook@localhost:5432/studybook"
    upload_dir: str = "uploads"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Fallback Anthropic key (env var ANTHROPIC_API_KEY or .env), used when the key saved in
    # AppSettings is empty. The saved key wins.
    anthropic_api_key: str | None = None


settings = Settings()
