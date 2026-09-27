from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    valkey_host: str
    valkey_port: int
    api_internal_url: str
    agent_service_token: str
    # LLM duy nhất: OpenRouter (langchain-openrouter ChatOpenRouter).
    openrouter_api_key: str
    llm_model: str
    llm_timeout: int
    # Pin version để ngưỡng confidence ổn định (docs: pin khi threshold đã tune).
    jev_model: str = "typesafe/jev-1.13"
    jev_timeout: float = 3.0
    jev_min_confidence: float = 0.6

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
