"""JevRouter — route task bằng Jev Choice qua OpenRouter.

Contract (theo tests/test_router.py):
- POST {base}/api/alpha/decisions, Bearer OPENROUTER_API_KEY
- body.questions.task = Choice {type, criteria, state}
- response.answers.task = {choice, confidence} → (task, confidence)
- Lỗi/key trống → None (fail-open, route_node mặc định qa).
"""

from __future__ import annotations

import httpx

DECISIONS_PATH = "/api/alpha/decisions"
BASE_URL = "https://openrouter.ai/api"

CRITERIA: dict[str, str] = {
    "verify": "Kiểm tra chất lượng một câu hỏi bank cụ thể (đúng/sai, đáp án, trích dẫn).",
    "index": "Đánh index/gán metadata cho câu hỏi bank (round, domain, difficulty).",
    "qa": "Hỏi đáp về trận đấu, điểm số, trạng thái live.",
    "ops": "Vận hành trận đấu (mở/chốt câu, điều khiển live).",
    "assist": "Hỗ trợ soạn câu hỏi mới cho qauthor.",
    "refuse": "Từ chối: ngoài phạm vi hoặc thiếu quyền.",
}

from app.utils.state import TrackKind

# Tier-2: track soạn/kiểm tra câu — Jev chọn theo nội dung, không hardcode domain.
TRACK_CRITERIA: dict[TrackKind, str] = {
    "reason": "Câu suy luận, tính toán nhiều bước, bẫy tư duy.",
    "fact": "Câu ghi nhớ fact, lịch sử, đáp án ổn định.",
    "fresh": "Câu cần nguồn cập nhật liên tục, số liệu thời sự.",
}


class JevRouter:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        from app.config import settings

        self._client = client or httpx.AsyncClient(
            base_url=BASE_URL, timeout=settings.jev_timeout
        )
        self._owned = client is None

    async def route(self, question: str, role: str) -> tuple[str, float] | None:
        return await self._choose("task", CRITERIA, question, role)

    async def route_track(self, question: str) -> tuple[str, float] | None:
        """Tier-2: chọn track soạn/kiểm tra (reason/fact/fresh)."""
        return await self._choose("track", TRACK_CRITERIA, question, "")

    async def _choose(
        self, name: str, criteria: dict[str, str], question: str, role: str
    ) -> tuple[str, float] | None:
        from app.config import settings

        key = settings.openrouter_api_key
        if not key:
            return None
        try:
            resp = await self._client.post(
                DECISIONS_PATH,
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": settings.jev_model,
                    "questions": {
                        name: {
                            "type": "choice",
                            "criteria": criteria,
                            "state": {"question": question, "role": role},
                        }
                    },
                },
            )
            resp.raise_for_status()
            ans = resp.json()["answers"][name]
            choice = ans.get("choice")
            confidence = float(ans.get("confidence", 0))
            if choice not in criteria:
                return None
            return (choice, confidence)
        except Exception:  # noqa: BLE001 — router không được làm ask chết
            return None

    async def aclose(self) -> None:
        if self._owned:
            await self._client.aclose()
