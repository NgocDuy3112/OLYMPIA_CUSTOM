from __future__ import annotations

import pytest

from tests.test_agent import StubRouter, make_service


def test_mcp_allowlist_covers_task_kinds():
    """Allowlist MCP chia theo subagent — mọi task (trừ refuse) đều có tools."""
    from typing import get_args

    from app.utils.nodes import TASK_MCP_TOOLS
    from app.utils.state import TaskKind

    assert set(TASK_MCP_TOOLS) >= set(get_args(TaskKind)) - {"refuse"}
    assert TASK_MCP_TOOLS["ops"] >= {"score_calculate", "score_adjust"}
    assert TASK_MCP_TOOLS["assist"] >= {"bank_create", "grade_llm"}
    assert TASK_MCP_TOOLS["reason"] >= {"bank_create", "grade_llm"}


def test_task_subagent_map_covers_task_kinds():
    from typing import get_args

    from app.agent import TASK_SUBAGENT
    from app.utils.state import TaskKind

    assert set(TASK_SUBAGENT) == set(get_args(TaskKind))
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
