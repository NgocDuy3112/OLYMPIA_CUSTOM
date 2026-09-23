"""Ports — interfaces the tool layer depends on. Adapters implement these."""

from __future__ import annotations

from typing import Protocol

from app.domain.models import PlayerScore, UserRole


class MatchStateRepo(Protocol):
    """Hot state — read straight from Valkey."""

    async def get_snapshot(self, match_code: str) -> dict | None: ...


class ScoreRepo(Protocol):
    """DB-derived data, via Fastify internal endpoints."""

    async def get_scoreboard(self, match_code: str) -> list[PlayerScore]: ...


class QuestionRepo(Protocol):
    async def get_questions(self, match_code: str, role: UserRole) -> list[dict]: ...


class TournamentRepo(Protocol):
    async def get_standings(self, tournament_code: str) -> list[dict]: ...


class MatchLookupRepo(Protocol):
    async def find_tournament_code(self, match_code: str) -> str | None: ...


class BankRepo(Protocol):
    """Question bank — read + write qua Fastify internal endpoints."""

    async def search_bank(self, q: str = "", round_hint: str = "") -> list[dict]: ...

    async def get_bank_row(self, bank_code: str) -> dict | None: ...

    async def update_bank_row(self, bank_id: str, updates: dict) -> dict: ...

    async def place_to_match(
        self, bank_code: str, match_code: str, round: str
    ) -> dict: ...


class DiscordRepo(Protocol):
    """Discord identity + commands, via Fastify /discord endpoints."""

    async def lookup_players(self, tournament_code: str) -> list[dict]: ...

    async def assign_role(self, tournament_code: str, user_code: str) -> dict: ...

    async def sync_nicknames(
        self, tournament_code: str, mapping: list[dict]
    ) -> dict: ...

    async def notify_prematch(
        self,
        tournament_code: str,
        match_code: str | None = None,
        starts_at: str | None = None,
    ) -> dict: ...

    async def lock_player(
        self,
        tournament_code: str,
        user_code: str,
        match_code: str | None = None,
    ) -> dict: ...


class LLMClient(Protocol):
    """Tool-calling loop provider. Swap adapters freely."""

    async def chat_with_tools(
        self,
        system: str,
        messages: list[dict],
        tools: list[dict],
        max_tool_rounds: int = 3,
    ) -> tuple[str, list[str]]:
        """Returns (final_text, tools_used)."""
        ...


def strip_answers_for_role(questions: list[dict], role: UserRole) -> list[dict]:
    """Role filter: only staff (operator/admin + controller/mc/qauthor scopes) see answers."""
    if role in ("operator", "admin", "controller", "mc", "qauthor"):
        return questions
    stripped = []
    for q in questions:
        copy = {k: v for k, v in q.items() if k not in ("answer",)}
        if copy.get("explanation"):
            copy["explanation"] = None
        stripped.append(copy)
    return stripped
