from pathlib import Path

from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    database_url: str

    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        extra="ignore",
    )


settings = Settings()
