from __future__ import annotations

import pytest

from tests.test_agent import StubRouter, make_service


def test_task_subagent_map_covers_task_kinds():

    from app.agent import TASK_SUBAGENT
    from app.utils.state import TaskKind

    assert set(TASK_SUBAGENT) == {e.value for e in TaskKind}
    assert TASK_SUBAGENT["qa"] == "qa_agent"
    assert TASK_SUBAGENT["verify"] == TASK_SUBAGENT["assist"] == "track_router"
    assert TASK_SUBAGENT["index"] == "bank_agent"
    assert TASK_SUBAGENT["ops"] == "ops_agent"
    assert TASK_SUBAGENT["refuse"] is None


def test_qa_prompt_rules_and_scenario():
    from app.utils.nodes import QA_SYSTEM as SYSTEM

    # Rules ported từ RulesPage (marker số điểm Giải Mã) + mức fact+kịch bản
    assert "+100" in SYSTEM and "Bứt Phá" in SYSTEM
    assert "kịch bản" in SYSTEM
    # ẩn đáp án theo vai trò vẫn giữ
    assert "đáp án" in SYSTEM


@pytest.mark.asyncio
async def test_track_node_fail_open_without_router():
    """Không router → bank_agent chung, graph không chết."""
    from types import SimpleNamespace

    from app.utils.nodes import TRACK_SUBAGENT, track_node

    out = await track_node(
        {"question": "soạn câu mới", "role": "qauthor"},
        SimpleNamespace(context={"router": None}),
    )
    assert out["subagent"] == "bank_agent"
    assert set(TRACK_SUBAGENT) == {"reason", "fact", "fresh"}
    assert TRACK_SUBAGENT["reason"] == "reason_agent"


@pytest.mark.asyncio
async def test_output_schema_hides_internals():
    """ainvoke chỉ trả AgentOutput — messages/subagent bị lọc."""
    from app.agent import build_graph

    graph = build_graph()
    out = await graph.ainvoke(
        {"tools_used": []},
        context={
            "match_code": "OC3_x",
            "question": "ping",
            "role": "controller",
            "models": {"default": None},
            "mcp": None,
            "router": None,
        },
    )
    assert "messages" not in out and "subagent" not in out
    assert out["task"] == "qa"


@pytest.mark.asyncio
async def test_memory_across_asks_same_thread():
    """Cùng user+trận (1 thread) → checkpoint cộng dồn, response dedupe."""
    import hashlib

    from app.agent import build_graph

    service = make_service()
    await service.ask("OC3_x", "câu một?", "controller")
    second = await service.ask("OC3_x", "câu hai?", "controller")
    assert second.tools_used == ["route:qa"]  # response gọn, không trùng
    tid = hashlib.sha256(b"anonymous:OC3_x").hexdigest()[:24]
    stored = await build_graph(service._checkpointer).aget_state(
        {"configurable": {"thread_id": tid}}
    )
    assert stored.values.get("tools_used") == ["route:qa", "route:qa"]


@pytest.mark.asyncio
async def test_ops_ask_runs_discord_plan(monkeypatch):
    from langchain_core.tools import StructuredTool

    from app.utils import nodes as nodes_module

    async def fake_tools(task: str, shared=None):
        async def run(tournament_code: str = "", user_code: str = "") -> dict:
            return {"tournamentCode": tournament_code, "userCode": user_code}

        return [
            StructuredTool.from_function(
                coroutine=run, name="assign_tournament_role", description="stub"
            )
        ]

    monkeypatch.setattr(nodes_module, "mcp_tools_for", fake_tools)
    service = make_service(router=StubRouter(("ops", 0.95)))
    response = await service.ask("OC3_x", "gán role P1 cho OC3_T1", "controller")
    assert "route:ops" in response.tools_used
    assert "assign_tournament_role" in response.tools_used
