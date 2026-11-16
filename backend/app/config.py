from pathlib import Path

from pydantic_settings import (
    BaseSettings,
    SettingsConfigDict,
)


class Settings(BaseSettings):
    database_url: str

    # Apply database migrations when the API starts.
    auto_migrate: bool = True

    # Read scanned PDF pages with Tesseract OCR when it is installed.
    ocr_enabled: bool = True
    tesseract_cmd: str = "tesseract"
    ocr_languages: str = "eng"

    openai_api_key: str | None = None
    openai_model: str = "gpt-5.6-luna"

    # Comma-separated list of browser origins allowed to call the API.
    cors_origins: str = (
        "http://localhost:5173,"
        "http://127.0.0.1:5173"
    )

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parent.parent / ".env",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
