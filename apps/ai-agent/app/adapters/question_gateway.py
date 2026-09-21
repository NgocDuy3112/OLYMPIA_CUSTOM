"""Question adapter — Seam QuestionRepo + MatchLookupRepo + TournamentRepo."""

from __future__ import annotations

from app.adapters.transport import ApiGatewayTransport
from app.domain.models import UserRole


class QuestionGatewayRepo(ApiGatewayTransport):
    """QuestionRepo + MatchLookupRepo + TournamentRepo qua Fastify."""

    async def get_questions(self, match_code: str, role: UserRole) -> list[dict]:
        data = await self._get(f"/questions/{match_code}")
        questions = data if isinstance(data, list) else data.get("questions", [])
        from app.domain.ports import strip_answers_for_role

        return strip_answers_for_role(questions, role)

    async def get_standings(self, tournament_code: str) -> list[dict]:
        data = await self._get(f"/tournaments/{tournament_code}/standings")
        return data.get("standings", [])

    async def find_tournament_code(self, match_code: str) -> str | None:
        data = await self._get(f"/matches/{match_code}")
        if not data:
            return None
        tournament_id = data.get("tournamentId") or (data.get("data", {}) or {}).get(
            "tournamentId"
        )
        return str(tournament_id) if tournament_id else None
