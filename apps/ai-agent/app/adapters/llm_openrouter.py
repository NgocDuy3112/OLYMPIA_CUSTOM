from __future__ import annotations

from langchain_openrouter import ChatOpenRouter

from app.config import settings
from app.domain.models import AgentError


def build_llm_model() -> ChatOpenRouter:
    if not settings.openrouter_api_key:
        raise AgentError("OPENROUTER_API_KEY chưa cấu hình", status_code=500)
    if not settings.llm_model:
        raise AgentError("LLM_MODEL chưa cấu hình", status_code=500)
    return ChatOpenRouter(
        model_name=settings.llm_model,
        openrouter_api_key=settings.openrouter_api_key,
        temperature=0.2,
        request_timeout=settings.llm_timeout,
    )
