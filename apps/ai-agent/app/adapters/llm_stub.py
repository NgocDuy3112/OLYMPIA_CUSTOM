"""LLM adapter — swappable provider behind one interface.

MVP ships a deterministic stub (no API key needed) so tools can be tested
first. anthropic/openai implementations follow the same interface.
"""

from __future__ import annotations

import json

from app.domain.ports import LLMClient


class StubLLMClient(LLMClient):
    """Deterministic: answers from tool results without an LLM round-trip.

    Picks the most relevant tool result and formats it. Useful for dev,
    tests, and offline demos. Replace provider via LLM_PROVIDER env.
    """

    async def chat_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tool_rounds: int = 3,
    ) -> tuple[str, list[str]]:
        user_question = next(
            (
                m["content"]
                for m in reversed(messages)
                if m.get("role") == "user"
            ),
            "",
        ).lower()

        tool_results = next(
            (
                m["content"]
                for m in reversed(messages)
                if m.get("role") == "tool"
            ),
            None,
        )
        tools_used: list[str] = []
        if tool_results:
            try:
                parsed = json.loads(tool_results)
                return json.dumps(parsed, ensure_ascii=False), tools_used
            except (json.JSONDecodeError, TypeError):
                return str(tool_results), tools_used
        return (
            f"[stub] Chưa gọi tool nào cho câu hỏi: {user_question}",
            tools_used,
        )
