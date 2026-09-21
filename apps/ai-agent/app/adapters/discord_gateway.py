"""Discord adapter — Seam DiscordRepo."""

from __future__ import annotations

from app.adapters.transport import ApiGatewayTransport


class DiscordGatewayRepo(ApiGatewayTransport):
    """DiscordRepo qua Fastify /discord endpoints."""

    async def lookup_players(self, tournament_code: str) -> list[dict]:
        data = await self._get(f"/discord/{tournament_code}/players")
        rows = data.get("list") or data.get("players") or []
        return rows if isinstance(rows, list) else []

    async def assign_role(self, tournament_code: str, user_code: str) -> dict:
        return await self._post(
            f"/discord/{tournament_code}/assign", {"userCode": user_code}
        )

    async def sync_nicknames(self, tournament_code: str, mapping: list[dict]) -> dict:
        return await self._post(
            f"/discord/{tournament_code}/sync-nicknames",
            {"mapping": mapping},
        )

    async def notify_prematch(
        self,
        tournament_code: str,
        match_code: str | None = None,
        starts_at: str | None = None,
    ) -> dict:
        return await self._post(
            f"/discord/{tournament_code}/notify-prematch",
            {"matchCode": match_code, "startsAt": starts_at},
        )

    async def lock_player(
        self,
        tournament_code: str,
        user_code: str,
        match_code: str | None = None,
    ) -> dict:
        return await self._post(
            f"/discord/{tournament_code}/lock",
            {"userCode": user_code, "matchCode": match_code},
        )
