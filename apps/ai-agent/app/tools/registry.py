"""Tool definitions + executor.

Tools return JSON-serializable dicts — these strings go straight into the
LLM context, so keep them compact.
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from typing import Any

from app.domain.models import AgentError, UserRole
from app.domain.ports import (
    MatchLookupRepo,
    MatchStateRepo,
    QuestionRepo,
    ScoreRepo,
    TournamentRepo,
)

ToolHandler = Callable[[dict[str, Any]], Awaitable[Any]]


class ToolContext:
    """Wires repos + per-request values — built once per ask."""

    def __init__(
        self,
        snapshot_repo: MatchStateRepo,
        score_repo: ScoreRepo,
        question_repo: QuestionRepo,
        tournament_repo: TournamentRepo,
        match_lookup: MatchLookupRepo,
        role: UserRole,
        match_code: str = "",
    ) -> None:
        self.snapshot_repo = snapshot_repo
        self.score_repo = score_repo
        self.question_repo = question_repo
        self.tournament_repo = tournament_repo
        self.match_lookup = match_lookup
        self.role = role
        self.match_code = match_code


TOOL_SCHEMAS: list[dict] = [
    {
        "name": "get_scoreboard",
        "description": "Điểm số hiện tại của tất cả thí sinh trong trận.",
        "parameters": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_match_info",
        "description": (
            "Trạng thái trận: phase hiện tại, danh sách thí sinh, "
            "tiến độ câu hỏi."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_questions",
        "description": (
            "Danh sách câu hỏi của trận (đáp án bị ẩn với player/spectator). "
            "Không dùng tool này khi user hỏi đáp án."
        ),
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_tournament_standings",
        "description": "Bảng xếp hạng giải đấu của trận hiện tại.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]

MAX_TOOL_ROUNDS = 3


async def execute_tool(name: str, args: dict, ctx: ToolContext) -> Any:
    match_code = ctx.match_code  # set per-request by AgentService

    if name == "get_scoreboard":
        scores = await ctx.score_repo.get_scoreboard(match_code)
        return [s.model_dump() for s in scores]

    if name == "get_match_info":
        snapshot = await ctx.snapshot_repo.get_snapshot(match_code)
        if snapshot is None:
            raise AgentError("Match not found or not active", status_code=404)
        return {
            "phase": snapshot.get("phase"),
            "players": snapshot.get("players", []),
            "scoreboard": snapshot.get("scoreboard", []),
            "profiles": snapshot.get("profiles", []),
        }

    if name == "get_questions":
        questions = await ctx.question_repo.get_questions(match_code, ctx.role)
        return questions

    if name == "get_tournament_standings":
        tournament_code = await ctx.match_lookup.find_tournament_code(
            match_code
        )
        if not tournament_code:
            return {"standings": None, "note": "Trận không thuộc giải đấu"}
        return {
            "standings": await ctx.tournament_repo.get_standings(
                tournament_code
            )
        }

    raise AgentError(f"Unknown tool: {name}", status_code=400)


def tool_result_message(name: str, result: Any) -> dict:
    try:
        content = json.dumps(result, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        content = str(result)
    return {"role": "tool", "name": name, "content": content}
