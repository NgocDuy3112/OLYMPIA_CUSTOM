from __future__ import annotations

import json

import pytest

from app.domain.ports import strip_answers_for_role
from app.services.agent_service import AgentService
from tests.fake_chat import FakeToolModel
from tests.fake_redis import FakeRedis


class _StubMcpTools:
    """Stub mcp_tools_for — trả LangChain tools canned, khỏi cần MCP server."""

    def __init__(self, tools: dict[str, object]) -> None:
        self._tools = tools

    async def __call__(self, task: str, shared=None):
        from langchain_core.tools import StructuredTool

        out = []
        for name, payload in self._tools.items():
            async def run(payload=payload) -> object:
                return payload

            out.append(
                StructuredTool.from_function(
                    coroutine=run, name=name, description="stub"
                )
            )
        return out


def make_service(cache=None, router=None) -> AgentService:
    return AgentService(
        cache=cache,
        router=router,
        model=FakeToolModel(),
    )


class StubRouter:
    """Trả đúng 1 decision — thay Jev trong test (không network)."""

    def __init__(self, decision) -> None:
        self.decision = decision

    async def route(self, question: str, role: str):
        return self.decision


@pytest.mark.asyncio
async def test_scoreboard_question_returns_scores(monkeypatch):
    """Data đi MCP adapter (stub) — internal chỉ còn snapshot/discord."""
    from langchain_core.tools import StructuredTool

    from app.utils import nodes as nodes_module

    rows = [
        {"userCode": "P1", "userName": "Minh", "position": 1, "score": 100},
        {"userCode": "P2", "userName": "An", "position": 2, "score": 80},
    ]

    async def fake_tools(task: str, shared=None):
        async def run() -> list:
            return rows

        return [
            StructuredTool.from_function(
                coroutine=run, name="get_scoreboard", description="stub"
            )
        ]

    monkeypatch.setattr(nodes_module, "mcp_tools_for", fake_tools)
    service = make_service()
    response = await service.ask("OC3_x", "Ai đang dẫn đầu?", "controller")
    response = await service.ask("OC3_x", "Ai đang dẫn đầu?", "controller")
    assert "get_scoreboard" in response.tools_used
    scoreboard_rows = [
        p
        for p in all_tool_results(response.answer)
        if isinstance(p, dict) and "userCode" in p
    ]
    assert any(p["userCode"] == "P1" for p in scoreboard_rows)


def test_build_llm_model_requires_key(monkeypatch):
    from app import config as config_module
    from app.adapters.llm_openrouter import build_llm_model
    from app.domain.models import AgentError

    monkeypatch.setattr(config_module.settings, "openrouter_api_key", "")
    try:
        build_llm_model()
    except AgentError as exc:
        assert exc.status_code == 500
    else:
        raise AssertionError("expected AgentError")


def all_tool_results(answer: str) -> list:
    """FakeToolModel returns tool results as a JSON list — flatten one level."""
    try:
        data = json.loads(answer)
        if not isinstance(data, list):
            return []
        flat: list = []
        for item in data:
            if isinstance(item, list):
                flat.extend(item)
            else:
                flat.append(item)
        return flat
    except (json.JSONDecodeError, TypeError):
        return []


@pytest.mark.asyncio
async def test_role_filter_strips_answers():
    questions = [
        {
            "questionCode": "Q1",
            "content": "2+2?",
            "answer": "4",
            "explanation": "cộng",
        }
    ]
    operator_view = strip_answers_for_role(questions, "operator")
    assert operator_view[0]["answer"] == "4"
    controller_view = strip_answers_for_role(questions, "controller")
    assert controller_view[0]["answer"] == "4"
    author_view = strip_answers_for_role(questions, "qauthor")
    assert author_view[0]["answer"] == "4"


@pytest.mark.asyncio
async def test_mcp_down_no_crash():
    """MCP chết → agent không tools, không 500."""
    service = make_service()
    response = await service.ask("OC3_missing", "câu hỏi hiện tại?", "controller")
    assert "route:qa" in response.tools_used


@pytest.mark.asyncio
async def test_cache_roundtrip():
    cache = FakeRedis()
    service = make_service(cache)
    first = await service.ask("OC3_x", "điểm?", "controller")
    assert not first.cached
    second = await service.ask("OC3_x", "điểm?", "controller")
    assert second.cached


@pytest.mark.asyncio
async def test_no_internal_tools_left():
    """Không còn internal tools — agent gọi duy nhất qua MCP adapter."""
    import app.utils.tools as tools_module

    leftovers = [
        name
        for name in (
            "ToolContext",
            "TOOL_SCHEMAS",
            "WRITE_TOOLS",
            "execute_tool",
            "execute_tool_inner",
            "lc_tools",
            "QA_TOOLS",
            "BANK_TOOLS",
            "OPS_TOOLS",
        )
        if hasattr(tools_module, name)
    ]
    assert leftovers == []


@pytest.mark.asyncio
async def test_refuse_write_request_answers_use_ui():
    """Yêu cầu update → route:refuse, trả lời dùng UI."""
    service = make_service(router=StubRouter(("refuse", 0.95)))
    response = await service.ask(
        "BANK_REVIEW", "update QB_KDC_001 đáp án Hà Nội", "qauthor"
    )
    assert "route:refuse" in response.tools_used
    assert "qauthor" in response.answer


@pytest.mark.asyncio
async def test_ask_verify_routes_bank_tool(monkeypatch):
    from langchain_core.tools import StructuredTool

    from app.utils import nodes as nodes_module

    async def fake_tools(task: str, shared=None):
        async def run(bank_code: str = "") -> dict:
            return {"bank_code": bank_code, "answer": "Hà Nội"}

        return [
            StructuredTool.from_function(
                coroutine=run, name="verify_bank_question", description="stub"
            )
        ]

    monkeypatch.setattr(nodes_module, "mcp_tools_for", fake_tools)
    service = make_service(router=StubRouter(("verify", 0.9)))
    response = await service.ask(
        "BANK_REVIEW", "check QB_KDC_001 chính xác ko", "qauthor"
    )
    assert "route:verify" in response.tools_used
    assert "verify_bank_question" in response.tools_used
