"""Adapter: DB-derived data via Fastify internal endpoints.

Fastify validates session/role before forwarding — this adapter trusts the
caller and passes X-User-Role so internal endpoints can apply role filters.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.domain.models import AgentError, PlayerScore, UserRole


class ApiGatewayRepo:
    """ScoreRepo + QuestionRepo + TournamentRepo + MatchLookupRepo + DiscordRepo."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(
            base_url=settings.api_internal_url,
            headers={"X-Agent-Token": settings.agent_service_token},
            timeout=10,
        )

    async def get_scoreboard(self, match_code: str) -> list[PlayerScore]:
        data = await self._get(f"/scoreboard/{match_code}")
        rows = data.get("scoreboard") or []
        return [PlayerScore.model_validate(row) for row in rows]

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

    # ── DiscordRepo ──

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

    # ── BankRepo (QAuthor tools — agent token, internal) ──

    async def search_bank(
        self, q: str = "", tags: str = "", round_hint: str = ""
    ) -> list[dict]:
        params = {k: v for k, v in {"q": q, "tags": tags}.items() if v}
        if round_hint:
            params["round_hint"] = round_hint
        query = "&".join(f"{k}={v}" for k, v in params.items())
        data = await self._get(f"/bank/search{('?' + query) if query else ''}")
        rows = data.get("rows") or []
        return rows if isinstance(rows, list) else []

    async def get_bank_row(self, bank_code: str) -> dict | None:
        rows = await self.search_bank(q=bank_code)
        code = bank_code.upper()
        for r in rows:
            if str(r.get("bankCode") or r.get("bank_code") or "").upper() == code:
                return r
        return None

    async def update_bank_row(self, bank_id: str, updates: dict) -> dict:
        try:
            response = await self._client.patch(f"/bank/{bank_id}", json=updates)
        except httpx.HTTPError as error:
            raise AgentError(f"API gateway unreachable: {error}") from error
        if response.status_code == 404:
            raise AgentError("Bank question not found", status_code=404)
        if response.status_code >= 400:
            raise AgentError(
                f"API gateway error {response.status_code}", status_code=502
            )
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else payload
        return data if isinstance(data, dict) else {"result": data}

    async def place_to_match(
        self, bank_code: str, match_code: str, round: str
    ) -> dict:
        return await self._post(
            "/questions/pick",
            {"bankCode": bank_code, "matchCode": match_code, "round": round},
        )

    async def _post(self, path: str, body: dict) -> dict:
        try:
            response = await self._client.post(path, json=body)
        except httpx.HTTPError as error:
            raise AgentError(f"API gateway unreachable: {error}") from error
        if response.status_code == 404:
            raise AgentError("Not found", status_code=404)
        if response.status_code == 403:
            raise AgentError("Forbidden: staff role required", status_code=403)
        if response.status_code >= 400:
            raise AgentError(
                f"API gateway error {response.status_code}",
                status_code=502,
            )
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else payload
        return data if isinstance(data, dict) else {"result": data}

    async def _get(self, path: str) -> dict:
        try:
            response = await self._client.get(path)
        except httpx.HTTPError as error:
            raise AgentError(f"API gateway unreachable: {error}") from error
        if response.status_code == 404:
            raise AgentError("Not found", status_code=404)
        if response.status_code >= 400:
            raise AgentError(
                f"API gateway error {response.status_code}",
                status_code=502,
            )
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else payload
        if data is None:
            return {}
        return data if isinstance(data, dict) else {"list": data}

    async def aclose(self) -> None:
        await self._client.aclose()
