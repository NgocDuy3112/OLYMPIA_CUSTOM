from __future__ import annotations

import json

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult


class FakeToolModel(BaseChatModel):
    def _llm_type(self) -> str:
        return "fake"

    def bind_tools(self, tools, **kwargs):
        self.__dict__["bound"] = list(tools)
        return self

    @property
    def bound(self):
        return self.__dict__.get("bound", [])

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        tool_msgs = [m for m in messages if isinstance(m, ToolMessage)]
        if tool_msgs:
            payloads = []
            for m in tool_msgs:
                try:
                    payloads.append(json.loads(str(m.content)))
                except (json.JSONDecodeError, TypeError):
                    payloads.append(str(m.content))
            content = json.dumps(payloads, ensure_ascii=False, default=str)
            return ChatResult(
                generations=[ChatGeneration(message=AIMessage(content=content))]
            )
        tool_calls = [
            {"name": t.name, "args": {}, "id": f"call_{i}", "type": "tool_call"}
            for i, t in enumerate(self.bound)
        ]
        return ChatResult(
            generations=[
                ChatGeneration(message=AIMessage(content="", tool_calls=tool_calls))
            ]
        )
