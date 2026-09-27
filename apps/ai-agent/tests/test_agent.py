from __future__ import annotations

import json

import pytest

from app.domain.models import PlayerScore
from app.domain.ports import strip_answers_for_role
from app.services.agent_service import AgentService
from tests.fake_chat import FakeToolModel
from tests.fake_redis import FakeRedis


class FakeSnapshotRepo:
    def __init__(self, snapshot: dict | None) -> None:
        self.snapshot = snapshot

    async def get_snapshot(self, match_code: str) -> dict | None:
        return self.snapshot


class FakeGateway:
    def __init__(self, scoreboard=None, questions=None, standings=None, bank=None):
        self._scoreboard = scoreboard or []
        self._questions = questions or []
        self._standings = standings or []
        self._bank = bank or {}
        self.calls: list[str] = []

    async def get_scoreboard(self, match_code: str) -> list[PlayerScore]:
        self.calls.append("scoreboard")
        return self._scoreboard

    async def get_questions(self, match_code: str, role) -> list[dict]:
        self.calls.append("questions")
        return self._questions

    async def get_standings(self, tournament_code: str) -> list[dict]:
        self.calls.append("standings")
        return self._standings

    async def find_tournament_code(self, match_code: str) -> str | None:
        self.calls.append("lookup")
        return None

    # ── BankRepo ──

    async def search_bank(self, q="", round_hint="") -> list[dict]:
        self.calls.append("bank_search")
        return [r for r in self._bank.values() if not q or q.upper() in r.get("bankCode", "")]

    async def get_bank_row(self, bank_code: str) -> dict | None:
        self.calls.append("bank_get")
        return self._bank.get(bank_code.upper())

    async def update_bank_row(self, bank_id: str, updates: dict) -> dict:
        self.calls.append("bank_update")
        return {"id": bank_id, **updates}

    async def place_to_match(self, bank_code: str, match_code: str, round: str) -> dict:
        self.calls.append("bank_place")
        return {"bankCode": bank_code, "matchCode": match_code, "round": round}

    # ── DiscordRepo ──

    async def lookup_players(self, tournament_code: str) -> list[dict]:
        self.calls.append("discord_lookup")
        return []

    async def assign_role(self, tournament_code: str, user_code: str) -> dict:
        self.calls.append("discord_assign")
        return {"tournamentCode": tournament_code, "userCode": user_code}

    async def sync_nicknames(self, tournament_code: str, mapping: list[dict]) -> dict:
        self.calls.append("discord_sync")
        return {"synced": len(mapping)}

    async def notify_prematch(
        self, tournament_code, match_code=None, starts_at=None
    ) -> dict:
        self.calls.append("discord_notify")
        return {"notified": True}

    async def lock_player(
        self, tournament_code, user_code, match_code=None
    ) -> dict:
        self.calls.append("discord_lock")
        return {"locked": True}


SNAPSHOT = {
    "phase": "kdc",
    "players": [{"user_code": "P1"}, {"user_code": "P2"}],
    "scoreboard": [],
    "profiles": [],
}


def make_service(snapshot, gateway, cache=None, router=None) -> AgentService:
    return AgentService(
        snapshot_repo=FakeSnapshotRepo(snapshot),
        score_repo=gateway,
        question_repo=gateway,
        bank_repo=gateway,
        discord_repo=gateway,
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
async def test_scoreboard_question_returns_scores():
    gateway = FakeGateway(
        scoreboard=[
            PlayerScore(userCode="P1", userName="Minh", position=1, score=100),
            PlayerScore(userCode="P2", userName="An", position=2, score=80),
        ]
    )
    service = make_service(SNAPSHOT, gateway)
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
async def test_snapshot_missing_returns_error_note():
    """Tool failure is captured as an error note; service must not 500."""
    gateway = FakeGateway()
    service = make_service(None, gateway)
    response = await service.ask("OC3_missing", "câu hỏi hiện tại?", "controller")
    assert "error" in response.answer


@pytest.mark.asyncio
async def test_cache_roundtrip():
    gateway = FakeGateway(
        scoreboard=[PlayerScore(userCode="P1", userName="M", score=1)]
    )
    cache = FakeRedis()
    service = make_service(SNAPSHOT, gateway, cache)
    first = await service.ask("OC3_x", "điểm?", "controller")
    assert not first.cached
    second = await service.ask("OC3_x", "điểm?", "controller")
    assert second.cached


@pytest.mark.asyncio
async def test_discord_write_requires_staff():
    from app.domain.models import AgentError
    from app.utils.tools import ToolContext, execute_tool

    gateway = FakeGateway()
    ctx = ToolContext(
        snapshot_repo=FakeSnapshotRepo(SNAPSHOT),
        score_repo=gateway,
        question_repo=gateway,
        tournament_repo=gateway,
        match_lookup=gateway,
        role="qauthor",
        match_code="OC3_x",
        discord_repo=gateway,
    )
    with pytest.raises(AgentError):
        await execute_tool(
            "assign_tournament_role",
            {"tournament_code": "T1", "user_code": "P1"},
            ctx,
        )


BANK_ROW = {
    "id": "bank-1",
    "bankCode": "QB_KDC_001",
    "content": "Thủ đô của Việt Nam?",
    "answer": "Hà Nội",
    "explanation": None,
    "roundHint": "KD_C",
}


def bank_ctx(gateway, role="qauthor"):
    from app.utils.tools import ToolContext as Ctx

    return Ctx(
        snapshot_repo=FakeSnapshotRepo(SNAPSHOT),
        score_repo=gateway,
        question_repo=gateway,
        tournament_repo=gateway,
        match_lookup=gateway,
        role=role,
        match_code="BANK_REVIEW",
        discord_repo=gateway,
        bank_repo=gateway,
    )


@pytest.mark.asyncio
async def test_verify_bank_question_returns_row():
    from app.utils.tools import execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    ctx = bank_ctx(gateway)
    result = await execute_tool("verify_bank_question", {"bank_code": "QB_KDC_001"}, ctx)
    assert result["answer"] == "Hà Nội"
    assert result["round_hint"] == "KD_C"


@pytest.mark.asyncio
async def test_write_tools_removed_read_only():
    """Ocee read-only: mọi write tool chặn ở execute_tool, bất kể role."""
    from app.domain.models import AgentError
    from app.utils.tools import WRITE_TOOLS, execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    cases = (
        ("update_bank_question", {"bank_code": "QB_KDC_001", "answer": "Huế"}),
        (
            "place_question_to_match",
            {"bank_code": "QB_KDC_001", "match_code": "OC3_M_1", "round": "BP"},
        ),
        ("propose_bank_edit", {"bank_code": "QB_KDC_001", "request": "đổi đáp án"}),
    )
    for role in ("qauthor", "mc", "controller"):
        ctx = bank_ctx(gateway, role=role)
        for name, args in cases:
            with pytest.raises(AgentError) as exc:
                await execute_tool(name, args, ctx)
            assert "read-only" in str(exc.value)
    assert "bank_update" not in gateway.calls
    assert "bank_place" not in gateway.calls
    # Schema cũng gỡ — LLM không thấy tool ghi.
    from app.utils.tools import TOOL_SCHEMAS

    assert not {t["name"] for t in TOOL_SCHEMAS} & WRITE_TOOLS


@pytest.mark.asyncio
async def test_suggest_bank_review_returns_checklist():
    from app.utils.tools import execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    ctx = bank_ctx(gateway)
    result = await execute_tool("suggest_bank_review", {"bank_code": "QB_KDC_001"}, ctx)
    assert result["bank_code"] == "QB_KDC_001"
    assert "similar" in result and "checklist" in result
    assert "bank_get" in gateway.calls


@pytest.mark.asyncio
async def test_refuse_write_request_answers_use_ui():
    """Yêu cầu update → route:refuse, trả lời dùng UI, không bank write nào chạy."""
    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    service = make_service(SNAPSHOT, gateway, router=StubRouter(("refuse", 0.95)))
    response = await service.ask(
        "BANK_REVIEW", "update QB_KDC_001 đáp án Hà Nội", "qauthor"
    )
    assert "route:refuse" in response.tools_used
    assert "qauthor" in response.answer
    assert "bank_update" not in gateway.calls
    assert "bank_place" not in gateway.calls


@pytest.mark.asyncio
async def test_ask_verify_routes_bank_tool():
    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    service = make_service(SNAPSHOT, gateway, router=StubRouter(("verify", 0.9)))
    response = await service.ask(
        "BANK_REVIEW", "check QB_KDC_001 chính xác ko", "qauthor"
    )
    assert "route:verify" in response.tools_used
    assert "verify_bank_question" in response.tools_used
