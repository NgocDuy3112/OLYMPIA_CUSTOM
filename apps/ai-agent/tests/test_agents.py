from __future__ import annotations

import pytest

from tests.test_agent import SNAPSHOT, FakeGateway, StubRouter, make_service


class _DiscordGateway(FakeGateway):
    async def assign_role(self, tournament_code: str, user_code: str) -> dict:
        self.calls.append("discord_assign")
        return {"tournamentCode": tournament_code, "userCode": user_code}


def test_schema_isolation():
    """Mỗi agent chỉ thấy schema nhóm mình; chia hết 13 tools; không tool ghi."""
    from app.utils.tools import (
        BANK_TOOLS,
        OPS_TOOLS,
        QA_TOOLS,
        TOOL_SCHEMAS,
        WRITE_TOOLS,
    )

    qa = {t["name"] for t in QA_TOOLS}
    bank = {t["name"] for t in BANK_TOOLS}
    ops = {t["name"] for t in OPS_TOOLS}
    assert qa & bank == set() and qa & ops == set() and bank & ops == set()
    assert qa | bank | ops == {t["name"] for t in TOOL_SCHEMAS}
    assert not (qa | bank | ops) & WRITE_TOOLS


def test_task_subagent_map_covers_task_kinds():
    from typing import get_args

    from app.agent import TASK_SUBAGENT
    from app.utils.state import TaskKind

    assert set(TASK_SUBAGENT) == set(get_args(TaskKind))
    assert TASK_SUBAGENT["qa"] == "qa_agent"
    assert (
        TASK_SUBAGENT["verify"]
        == TASK_SUBAGENT["index"]
        == TASK_SUBAGENT["assist"]
        == "bank_agent"
    )
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
async def test_ops_ask_runs_discord_plan():
    gateway = _DiscordGateway()
    service = make_service(SNAPSHOT, gateway, router=StubRouter(("ops", 0.95)))
    response = await service.ask("OC3_x", "gán role P1 cho OC3_T1", "controller")
    assert "route:ops" in response.tools_used
    assert "assign_tournament_role" in response.tools_used
    assert "discord_assign" in gateway.calls
