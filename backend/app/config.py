from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App-level settings, distinct from cognee's own env-driven config classes."""

    frontend_origin: str = "http://localhost:3000"
    admin_shared_secret: str = "local-dev-secret"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
