"""LLM adapter — gọi OpenAI-compatible endpoint trực tiếp bằng httpx (async).

Tự quản header/payload, không qua SDK. Interface giữ nguyên LLMClient
để AgentService/graph không đổi. Chạy mọi backend OpenAI-compatible
(OpenAI, Ollama, vLLM, LM Studio...) qua LLM_BASE_URL.
"""

from __future__ import annotations

import json

import httpx

from app.config import settings
from app.domain.models import AgentError
from app.domain.ports import LLMClient


class HttpLLMClient(LLMClient):
    """OpenAI-compatible chat completions qua httpx.AsyncClient.

    Env:
      LLM_BASE_URL — vd http://localhost:11434/v1 (Ollama),
                     https://api.openai.com/v1 (OpenAI)
      LLM_API_KEY  — Bearer token (để trống nếu provider local không cần)
      LLM_MODEL    — tên model
      LLM_TIMEOUT  — giây, default 30
    """

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        base_url = (settings.llm_base_url or "").rstrip("/")
        self._client = client or httpx.AsyncClient(
            base_url=base_url,
            headers=self._headers(),
            timeout=settings.llm_timeout,
        )
        self._model = settings.llm_model

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if settings.llm_api_key:
            headers["Authorization"] = f"Bearer {settings.llm_api_key}"
        return headers

    async def chat_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tool_rounds: int = 3,
    ) -> tuple[str, list[str]]:
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                *[self._to_chat_message(m) for m in messages],
            ],
            "temperature": 0.2,
        }
        if tools:
            payload["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t["name"],
                        "description": t.get("description", ""),
                        "parameters": t.get("parameters", {"type": "object"}),
                    },
                }
                for t in tools
            ]
        from app.metrics import LLM_ERRORS

        try:
            response = await self._client.post("/chat/completions", json=payload)
        except httpx.HTTPError as error:
            LLM_ERRORS.inc()
            raise AgentError(f"LLM unreachable: {error}") from error
        if response.status_code == 401:
            LLM_ERRORS.inc()
            raise AgentError("LLM unauthorized (sai API key)", status_code=502)
        if response.status_code == 429:
            LLM_ERRORS.inc()
            raise AgentError("LLM rate limit", status_code=502)
        if response.status_code >= 400:
            LLM_ERRORS.inc()
            detail = response.text[:200]
            raise AgentError(f"LLM error {response.status_code}: {detail}")
        try:
            data = response.json()
            text = data["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, ValueError) as error:
            LLM_ERRORS.inc()
            raise AgentError(f"LLM response lạ: {error}") from error
        return text, []

    @staticmethod
    def _to_chat_message(m: dict) -> dict:
        role = m.get("role", "user")
        if role == "tool":
            content = m.get("content", "")
            if not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False, default=str)
            name = str(m.get("name", "tool"))
            return {"role": "user", "content": f"[{name}] {content}"}
        content = m.get("content", "")
        if not isinstance(content, str):
            content = json.dumps(content, ensure_ascii=False, default=str)
        return {"role": "user" if role not in ("user", "assistant", "system") else role, "content": content}

    async def aclose(self) -> None:
        await self._client.aclose()


def build_llm_client() -> LLMClient:
    """Factory — luôn HTTP, thiếu base_url/model thì 500 rõ lý do."""
    if not settings.llm_base_url:
        raise AgentError("LLM_BASE_URL chưa cấu hình", status_code=500)
    if not settings.llm_model:
        raise AgentError("LLM_MODEL chưa cấu hình", status_code=500)
    return HttpLLMClient()
