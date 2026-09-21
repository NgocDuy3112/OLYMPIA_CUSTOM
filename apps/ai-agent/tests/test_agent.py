"""Contract + scenario tests (no Valkey/HTTP needed — fakes only)."""

from __future__ import annotations

import json

import pytest

from app.domain.models import PlayerScore
from app.domain.ports import strip_answers_for_role
from app.services.agent_service import AgentService
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

    async def search_bank(self, q="", tags="", round_hint="") -> list[dict]:
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


SNAPSHOT = {
    "phase": "kdc",
    "players": [{"user_code": "P1"}, {"user_code": "P2"}],
    "scoreboard": [],
    "profiles": [],
}


def make_service(snapshot, gateway, cache=None) -> AgentService:
    return AgentService(
        llm=_EchoLLM(),
        snapshot_repo=FakeSnapshotRepo(snapshot),
        gateway=gateway,
        cache=cache,
    )


class _EchoLLM:
    """Returns ALL tool results as one JSON list — deterministic, no network."""

    async def chat_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tool_rounds: int = 3,
    ) -> tuple[str, list[str]]:
        tool_results = [m for m in messages if m.get("role") == "tool"]
        if tool_results:
            try:
                payloads = [json.loads(m["content"]) for m in tool_results]
            except (json.JSONDecodeError, TypeError):
                payloads = [m["content"] for m in tool_results]
            return json.dumps(payloads, ensure_ascii=False), []
        return "[stub] Không có dữ liệu.", []


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
        for p in _all_tool_results(response.answer)
        if isinstance(p, dict) and "userCode" in p
    ]
    assert any(p["userCode"] == "P1" for p in scoreboard_rows)


@pytest.mark.asyncio
async def test_http_llm_builds_payload_and_headers(monkeypatch):
    import httpx

    from app import config as config_module
    from app.adapters.llm_http import HttpLLMClient

    monkeypatch.setattr(config_module.settings, "llm_model", "test-model")
    seen: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        import json as _json

        seen["auth"] = request.headers.get("authorization")
        seen["body"] = _json.loads(request.content.decode())
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "ok-verdict"}}]},
        )

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(
        transport=transport,
        base_url="http://llm.test/v1",
        headers={"Content-Type": "application/json", "Authorization": "Bearer k"},
    )
    llm = HttpLLMClient(client=client)
    text, _used = await llm.chat_with_tools(
        "sys",
        [{"role": "user", "content": "hi"}],
        [{"name": "search_bank", "description": "d", "parameters": {"type": "object"}}],
    )
    assert text == "ok-verdict"
    assert seen["auth"] == "Bearer k"
    assert seen["body"]["model"] == "test-model"
    assert seen["body"]["tools"][0]["function"]["name"] == "search_bank"


@pytest.mark.asyncio
async def test_http_llm_unauthorized_maps_502():
    import httpx

    from app.adapters.llm_http import HttpLLMClient
    from app.domain.models import AgentError

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "bad key"})

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler), base_url="http://llm.test/v1"
    )
    llm = HttpLLMClient(client=client)
    try:
        await llm.chat_with_tools("sys", [{"role": "user", "content": "hi"}], [])
    except AgentError as exc:
        assert exc.status_code == 502
    else:
        raise AssertionError("expected AgentError")


def test_build_llm_client_requires_base_url(monkeypatch):
    from app import config as config_module
    from app.adapters.llm_http import build_llm_client
    from app.domain.models import AgentError

    monkeypatch.setattr(config_module.settings, "llm_base_url", "")
    try:
        build_llm_client()
    except AgentError as exc:
        assert exc.status_code == 500
    else:
        raise AssertionError("expected AgentError")


def _all_tool_results(answer: str) -> list:
    """_EchoLLM returns tool results as a JSON list — flatten one level."""
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
    from app.tools.registry import ToolContext, execute_tool

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
    "tags": "dia-ly,viet-nam",
    "roundHint": "KD_C",
}


def _bank_ctx(gateway, role="qauthor"):
    from app.tools.registry import ToolContext as Ctx

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
    from app.tools.registry import execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    ctx = _bank_ctx(gateway)
    result = await execute_tool("verify_bank_question", {"bank_code": "QB_KDC_001"}, ctx)
    assert result["answer"] == "Hà Nội"
    assert result["round_hint"] == "KD_C"


@pytest.mark.asyncio
async def test_bank_write_requires_qauthor():
    from app.domain.models import AgentError
    from app.tools.registry import execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    ctx = _bank_ctx(gateway, role="mc")
    with pytest.raises(AgentError):
        await execute_tool(
            "update_bank_question", {"bank_code": "QB_KDC_001", "answer": "Huế"}, ctx
        )
    with pytest.raises(AgentError):
        await execute_tool(
            "place_question_to_match",
            {"bank_code": "QB_KDC_001", "match_code": "OC3_M_1", "round": "BP"},
            ctx,
        )


@pytest.mark.asyncio
async def test_update_and_place_bank_tools():
    from app.tools.registry import execute_tool

    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    ctx = _bank_ctx(gateway)
    updated = await execute_tool(
        "update_bank_question", {"bank_code": "QB_KDC_001", "answer": "Hà Nội"}, ctx
    )
    assert updated["id"] == "bank-1"
    placed = await execute_tool(
        "place_question_to_match",
        {"bank_code": "QB_KDC_001", "match_code": "OC3_M_1", "round": "BP"},
        ctx,
    )
    assert placed["round"] == "BP"


def test_route_task_bank_kinds():
    from app.graph import route_task

    assert route_task("check QB_KDC_001 chính xác ko") == "verify"
    assert route_task("update QB_KDC_001 đáp án Hà Nội") == "update"
    assert route_task("bỏ QB_KDC_001 vào trận OC3_M_1 vòng Bứt phá") == "place"
    assert route_task("đánh index QB_KDC_001") == "index"
    assert route_task("ai đang dẫn đầu?") == "qa"


def test_normalize_tags_dedupes():
    from app.graph import _normalize_tags

    assert _normalize_tags("Dia-ly, viet-nam;dia-ly") == ["dia-ly", "viet-nam"]


@pytest.mark.asyncio
async def test_ask_verify_routes_bank_tool():
    gateway = FakeGateway(bank={"QB_KDC_001": BANK_ROW})
    service = make_service(SNAPSHOT, gateway)
    response = await service.ask(
        "BANK_REVIEW", "check QB_KDC_001 chính xác ko", "qauthor"
    )
    assert "route:verify" in response.tools_used
    assert "verify_bank_question" in response.tools_used
