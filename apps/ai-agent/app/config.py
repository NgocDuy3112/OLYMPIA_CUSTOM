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

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
