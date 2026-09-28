from __future__ import annotations

import httpx
import pytest

from tests.test_agent import make_service


def build_service(router=None):
    return make_service(router=router)


class _StubRouter:
    def __init__(self, decision) -> None:
        self.decision = decision

    async def route(self, question: str, role: str):
        return self.decision


def test_router_criteria_cover_task_kinds():
    """Criteria chứa đủ mọi TaskKind — Jev không thể chọn task lạ."""
    from typing import get_args

    from app.adapters.jev_router import CRITERIA
    from app.utils.state import TaskKind

    assert set(get_args(TaskKind)) <= set(CRITERIA)


@pytest.mark.asyncio
async def test_jev_router_parses_choice(monkeypatch):
    import json

    from app import config as config_module
    from app.adapters.jev_router import JevRouter

    monkeypatch.setattr(config_module.settings, "openrouter_api_key", "k-test")
    seen: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        body = json.loads(request.content.decode())
        seen["question"] = body["questions"]["task"]
        return httpx.Response(
            200,
            json={
                "answers": {
                    "task": {
                        "type": "choice",
                        "choice": "verify",
                        "confidence": 0.9,
                        "probabilities": {"verify": 0.9},
                    }
                }
            },
        )

    client = httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://openrouter.ai/api",
    )
    router = JevRouter(client=client)
    out = await router.route("check QB_KDC_001 chính xác ko", "qauthor")
    assert out == ("verify", 0.9)
    assert seen["url"].endswith("/api/alpha/decisions")
    assert seen["auth"] == "Bearer k-test"
    assert seen["question"]["type"] == "choice"
    await router.aclose()


@pytest.mark.asyncio
async def test_jev_router_fails_open(monkeypatch):
    from app import config as config_module
    from app.adapters.jev_router import JevRouter

    monkeypatch.setattr(config_module.settings, "openrouter_api_key", "k-test")
    calls = {"n": 0}

    def handler_500(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(500, json={"error": "boom"})

    router = JevRouter(
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler_500),
            base_url="https://openrouter.ai/api",
        )
    )
    assert await router.route("ai dẫn đầu?", "mc") is None
    await router.aclose()

    # Key trống → không gọi HTTP.
    monkeypatch.setattr(config_module.settings, "openrouter_api_key", "")
    router2 = JevRouter(
        client=httpx.AsyncClient(
            transport=httpx.MockTransport(handler_500),
            base_url="https://openrouter.ai/api",
        )
    )
    before = calls["n"]
    assert await router2.route("ai dẫn đầu?", "mc") is None
    assert calls["n"] == before
    await router2.aclose()


@pytest.mark.asyncio
async def test_service_uses_jev_high_confidence():
    """Jev tự tin → dùng đúng task Jev trả về."""
    service = build_service(router=_StubRouter(("assist", 0.95)))
    # Jev nói "assist" tự tin → dispatch bank_agent (assist)
    response = await service.ask("OC3_x", "đánh index QB_KDC_001", "qauthor")
    assert "route:assist" in response.tools_used


@pytest.mark.asyncio
async def test_service_low_confidence_defaults_qa():
    """Confidence dưới ngưỡng (0.6) → mặc định qa, không heuristic."""
    service = build_service(router=_StubRouter(("index", 0.4)))
    response = await service.ask("OC3_x", "đánh index QB_KDC_001", "qauthor")
    assert "route:qa" in response.tools_used


@pytest.mark.asyncio
async def test_service_keyword_when_router_none():
    """Không có router (chưa set key) → mặc định task qa, không lỗi."""
    service = build_service(router=None)
    response = await service.ask("OC3_x", "ai đang dẫn đầu?", "controller")
    assert "route:qa" in response.tools_used
