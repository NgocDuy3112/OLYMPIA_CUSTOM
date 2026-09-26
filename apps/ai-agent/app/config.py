"""Config via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    valkey_host: str
    valkey_port: int
    api_internal_url: str
    agent_service_token: str
    llm_api_key: str
    llm_model: str
    llm_base_url: str
    llm_timeout: int

    # Jev router (TypeSafe System One, Choice) — key trống → keyword fallback.
    typesafe_api_key: str = ""
    jev_model: str = "jev-latest"
    jev_timeout: float = 3.0
    jev_min_confidence: float = 0.6

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
