from __future__ import annotations

import httpx

from app.config import settings
from app.domain.models import AgentError


class ApiGatewayTransport:
    """Base transport — mọi gateway repo kế thừa class này."""

    def __init__(self) -> None:
        self._client = httpx.AsyncClient(
            base_url=settings.api_internal_url,
            headers={"X-Agent-Token": settings.agent_service_token},
            timeout=10,
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

    async def _patch(self, path: str, body: dict) -> dict:
        try:
            response = await self._client.patch(path, json=body)
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
