from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Everything the app stores lives here: the SQLite database, uploaded files and backups. `.` (the
    # backend folder) in development; the desktop app passes the OS's per-user data folder.
    data_dir: Path = Path(".")
    # Each of these defaults to its place inside `data_dir` (filled in below) unless set explicitly.
    database_url: str = ""
    upload_dir: str = ""
    # Where a restore saves its automatic copy of the data it replaces.
    backup_dir: str = ""
    cors_origins: list[str] = ["http://localhost:5173"]
    # Fallback Anthropic key (env var ANTHROPIC_API_KEY or .env), used when the key saved in
    # AppSettings is empty. The saved key wins.
    anthropic_api_key: str | None = None
    # Same for Gemini (env var GEMINI_API_KEY).
    gemini_api_key: str | None = None

    @model_validator(mode="after")
    def _paths_inside_data_dir(self) -> "Settings":
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'studybook.db'}"
        if not self.upload_dir:
            self.upload_dir = str(self.data_dir / "uploads")
        if not self.backup_dir:
            self.backup_dir = str(self.data_dir / "backups")
        return self


settings = Settings()
