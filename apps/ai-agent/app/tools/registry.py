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
    DiscordRepo,
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
        discord_repo: DiscordRepo | None = None,
    ) -> None:
        self.snapshot_repo = snapshot_repo
        self.score_repo = score_repo
        self.question_repo = question_repo
        self.tournament_repo = tournament_repo
        self.match_lookup = match_lookup
        self.role = role
        self.match_code = match_code
        self.discord_repo = discord_repo


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
            "Trạng thái trận: phase hiện tại, danh sách thí sinh, tiến độ câu hỏi."
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
    {
        "name": "lookup_player_by_discord",
        "description": (
            "Tra thí sinh trong giải theo Discord user ID hoặc nickname. "
            "Dùng trước khi nhắc tên để mention đúng người."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "tournament_code": {"type": "string"},
                "discord_user_id": {"type": "string"},
                "nickname": {"type": "string"},
            },
            "required": ["tournament_code"],
        },
    },
    {
        "name": "assign_tournament_role",
        "description": (
            "Gán Discord role + nickname cho thí sinh theo role trong giải. "
            "Chỉ controller/mc được gọi."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "tournament_code": {"type": "string"},
                "user_code": {"type": "string"},
            },
            "required": ["tournament_code", "user_code"],
        },
    },
    {
        "name": "sync_discord_nicknames",
        "description": ("Đồng bộ nickname Discord về DB. Chỉ controller/mc được gọi."),
        "parameters": {
            "type": "object",
            "properties": {
                "tournament_code": {"type": "string"},
                "mapping": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "discordUserId": {"type": "string"},
                            "nickname": {"type": "string"},
                        },
                    },
                },
            },
            "required": ["tournament_code", "mapping"],
        },
    },
    {
        "name": "notify_prematch",
        "description": (
            "Thông báo chuẩn bị vào trận qua Discord (fire-and-forget). "
            "Chỉ controller/mc được gọi."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "tournament_code": {"type": "string"},
                "match_code": {"type": "string"},
                "starts_at": {"type": "string"},
            },
            "required": ["tournament_code"],
        },
    },
    {
        "name": "lock_player_no_show",
        "description": (
            "Khóa thí sinh trễ giờ bằng cách tháo role trận khỏi member. "
            "Chỉ controller/mc được gọi."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "tournament_code": {"type": "string"},
                "user_code": {"type": "string"},
                "match_code": {"type": "string"},
            },
            "required": ["tournament_code", "user_code"],
        },
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
        tournament_code = await ctx.match_lookup.find_tournament_code(match_code)
        if not tournament_code:
            return {"standings": None, "note": "Trận không thuộc giải đấu"}
        return {"standings": await ctx.tournament_repo.get_standings(tournament_code)}

    if name == "lookup_player_by_discord":
        if ctx.discord_repo is None:
            raise AgentError("Discord repo not configured", status_code=500)
        players = await ctx.discord_repo.lookup_players(
            str(args.get("tournament_code", ""))
        )
        want_id = str(args.get("discord_user_id", "") or "")
        want_nick = str(args.get("nickname", "") or "").lower()
        for p in players:
            if want_id and p.get("discordUserId") == want_id:
                return p
            nick = str(p.get("discordNickname") or p.get("userName") or "").lower()
            if want_nick and want_nick in nick:
                return p
        return {"found": False, "note": "Không tìm thấy thí sinh"}

    if name == "assign_tournament_role":
        if ctx.discord_repo is None:
            raise AgentError("Discord repo not configured", status_code=500)
        _require_staff(ctx.role)
        return await ctx.discord_repo.assign_role(
            str(args.get("tournament_code", "")),
            str(args.get("user_code", "")),
        )

    if name == "sync_discord_nicknames":
        if ctx.discord_repo is None:
            raise AgentError("Discord repo not configured", status_code=500)
        _require_staff(ctx.role)
        mapping = args.get("mapping", [])
        if not isinstance(mapping, list):
            raise AgentError("mapping must be a list", status_code=400)
        return await ctx.discord_repo.sync_nicknames(
            str(args.get("tournament_code", "")), mapping
        )

    if name == "notify_prematch":
        if ctx.discord_repo is None:
            raise AgentError("Discord repo not configured", status_code=500)
        _require_staff(ctx.role)
        return await ctx.discord_repo.notify_prematch(
            str(args.get("tournament_code", "")),
            str(args.get("match_code", "") or match_code or None)
            if args.get("match_code", "") or match_code
            else None,
            str(args.get("starts_at", "") or None)
            if args.get("starts_at", "")
            else None,
        )

    if name == "lock_player_no_show":
        if ctx.discord_repo is None:
            raise AgentError("Discord repo not configured", status_code=500)
        _require_staff(ctx.role)
        return await ctx.discord_repo.lock_player(
            str(args.get("tournament_code", "")),
            str(args.get("user_code", "")),
            str(args.get("match_code", "") or match_code or None)
            if args.get("match_code", "") or match_code
            else None,
        )

    raise AgentError(f"Unknown tool: {name}", status_code=400)


def _require_staff(role: UserRole) -> None:
    if role not in ("controller", "mc"):
        raise AgentError("Forbidden: controller/mc role required", status_code=403)


def tool_result_message(name: str, result: Any) -> dict:
    try:
        content = json.dumps(result, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        content = str(result)
    return {"role": "tool", "name": name, "content": content}
