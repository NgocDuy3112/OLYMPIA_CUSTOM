"""Bank adapter — Seam BankRepo (QAuthor tools, agent token)."""

from __future__ import annotations

from app.adapters.transport import ApiGatewayTransport


class BankGatewayRepo(ApiGatewayTransport):
    """BankRepo qua Fastify internal endpoints."""

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
        return await self._patch(f"/bank/{bank_id}", updates)

    async def place_to_match(
        self, bank_code: str, match_code: str, round: str
    ) -> dict:
        return await self._post(
            "/questions/pick",
            {"bankCode": bank_code, "matchCode": match_code, "round": round},
        )
