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
    def __init__(self, scoreboard=None, questions=None, standings=None):
        self._scoreboard = scoreboard or []
        self._questions = questions or []
        self._standings = standings or []
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
        tool_results = [
            m for m in messages if m.get("role") == "tool"
        ]
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
            PlayerScore(
                userCode="P1", userName="Minh", position=1, score=100
            ),
            PlayerScore(
                userCode="P2", userName="An", position=2, score=80
            ),
        ]
    )
    service = make_service(SNAPSHOT, gateway)
    response = await service.ask(
        "OC3_x", "Ai đang dẫn đầu?", "player", "P1"
    )
    assert "get_scoreboard" in response.tools_used
    scoreboard_rows = [
        p
        for p in _all_tool_results(response.answer)
        if isinstance(p, dict) and "userCode" in p
    ]
    assert any(p["userCode"] == "P1" for p in scoreboard_rows)


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
    player_view = strip_answers_for_role(questions, "player")
    assert "answer" not in player_view[0]
    assert player_view[0]["explanation"] is None
    controller_view = strip_answers_for_role(questions, "controller")
    assert controller_view[0]["answer"] == "4"
    author_view = strip_answers_for_role(questions, "question_author")
    assert author_view[0]["answer"] == "4"


@pytest.mark.asyncio
async def test_snapshot_missing_returns_error_note():
    """Tool failure is captured as an error note; service must not 500."""
    gateway = FakeGateway()
    service = make_service(None, gateway)
    response = await service.ask(
        "OC3_missing", "câu hỏi hiện tại?", "player", "P1"
    )
    assert "error" in response.answer


@pytest.mark.asyncio
async def test_cache_roundtrip():
    gateway = FakeGateway(
        scoreboard=[PlayerScore(userCode="P1", userName="M", score=1)]
    )
    cache = FakeRedis()
    service = make_service(SNAPSHOT, gateway, cache)
    first = await service.ask("OC3_x", "điểm?", "player", "P1")
    assert not first.cached
    second = await service.ask("OC3_x", "điểm?", "player", "P1")
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
        role="player",
        match_code="OC3_x",
        discord_repo=gateway,
    )
    with pytest.raises(AgentError):
        await execute_tool(
            "assign_tournament_role",
            {"tournament_code": "T1", "user_code": "P1"},
            ctx,
        )
