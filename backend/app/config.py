from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", str(REPO_ROOT / ".env")),
        extra="ignore",
    )

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5-5"
    decks_dir: Path = Field(default=Path("./decks"))
    max_upload_mb: int = 25

    @property
    def resolved_decks_dir(self) -> Path:
        """Relative DECKS_DIR values are resolved from the repo root."""
        path = self.decks_dir
        return path if path.is_absolute() else (REPO_ROOT / path).resolve()

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
