"""Application configuration using Pydantic Settings."""

from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Library settings
    LIBRARY_PATH: str = "/books"

    # Database settings
    DATABASE_URL: str = "sqlite+aiosqlite:///./app.db"

    # AI Provider settings
    AI_PROVIDER: str = "disabled"  # Options: llamacpp, ollama, openai, disabled
    LLAMACPP_MODEL_PATH: Optional[str] = None
    LLAMACPP_CONTEXT_SIZE: int = 4096
    OLLAMA_MODEL: str = "qwen2.5:7b"
    OLLAMA_HOST: str = "http://ollama:11434"
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # AI Processing settings
    AI_BATCH_SIZE: int = 5
    AI_CACHE_TTL: int = 2592000  # 30 days in seconds


# Global settings instance
settings = Settings()
