from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    valkey_host: str
    valkey_port: int
    openrouter_api_key: str
    llm_model: str
    llm_timeout: int
    llm_model_qa: str | None = None
    llm_model_verify: str | None = None
    llm_model_index: str | None = None
    llm_model_assist: str | None = None
    llm_model_ops: str | None = None
    llm_model_reason: str | None = None
    llm_model_fact: str | None = None
    llm_model_fresh: str | None = None
    jev_model: str = "typesafe/jev-1.13"
    jev_timeout: float = 3.0
    jev_min_confidence: float = 0.6
    mcp_base_url: str = "http://localhost:8300"
    mcp_token: str = ""
    # MCP discord (send/verify) — server riêng, token riêng.
    mcp_discord_url: str = "http://localhost:8301"
    mcp_discord_token: str = ""
    # Postgres checkpointer (memory dài hạn). Trống = MemorySaver RAM.
    postgres_url: str = ""

    model_config = {"env_file": ".env", "env_prefix": ""}


settings = Settings()
