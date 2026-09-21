"""Score adapter — Seam ScoreRepo."""

from __future__ import annotations

from app.adapters.transport import ApiGatewayTransport
from app.domain.models import PlayerScore


class ScoreGatewayRepo(ApiGatewayTransport):
    """ScoreRepo qua Fastify internal endpoints."""

    async def get_scoreboard(self, match_code: str) -> list[PlayerScore]:
        data = await self._get(f"/scoreboard/{match_code}")
        rows = data.get("scoreboard") or []
        return [PlayerScore.model_validate(row) for row in rows]
