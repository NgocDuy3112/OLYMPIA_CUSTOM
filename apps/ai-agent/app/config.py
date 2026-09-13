"""Config via pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    valkey_host: str = "localhost"
    valkey_port: int = 6379
    api_internal_url: str = "http://localhost:8000/api"
    agent_service_token: str = ""
    llm_provider: str = "stub"  # stub | anthropic | openai
    llm_api_key: str = ""
    llm_model: str = "stub-mini"

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
