"""Jev router — TypeSafe System One (Choice) thay route_task keyword.

Không thêm dependency mới: tự gọi HTTP API bằng httpx (cùng pattern
llm_http.py). Fail-open: thiếu key / lỗi API / lựa chọn không hợp lệ
→ None, caller dùng keyword fallback — ask không bao giờ chết vì router.
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

API_BASE_URL = "https://api.typesafe.ai"

# Criteria map thẳng TaskKind — option name = giá trị code dùng.
# Mô tả tách bạch theo docs Choice: mỗi option nói rõ nó là gì AND không là gì.
CRITERIA: dict[str, str] = {
    "qa": (
        "Hỏi thông tin chung: điểm số, thứ hạng, luật chơi, trạng thái trận, "
        "BXH giải — không đụng một câu bank cụ thể nào"
    ),
    "verify": (
        "Kiểm tra một câu bank cụ thể (mã QB_*) có chính xác không — "
        "đối chiếu nội dung/đáp án, không sửa"
    ),
    "index": (
        "Tìm lại hoặc tag ngân hàng câu hỏi: tìm câu theo nội dung "
        "hoặc round_hint đã đánh index"
    ),
    "assist": (
        "Xin ý kiến/gợi ý xem có nên duyệt một câu bank QB_* — "
        "hỏi về review, không tự sửa"
    ),
    "refuse": (
        "Yêu cầu sửa nội dung/đáp án bank, bỏ hoặc chèn câu vào một trận — "
        "Ocee từ chối và chỉ dẫn dùng UI qauthor"
    ),
    "other": "Không khớp loại nào ở trên",
}


class JevRouter:
    """POST /v1/systemone — Choice 1 câu hỏi, trả (task, confidence) | None."""

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client or httpx.AsyncClient(
            base_url=API_BASE_URL,
            timeout=settings.jev_timeout,
        )

    async def route(self, question: str, role: str) -> tuple[str, float] | None:
        """Trả (task, confidence) hoặc None (fail-open → keyword fallback)."""
        if not settings.typesafe_api_key:
            return None
        payload = {
            "model": settings.jev_model,
            "state": {"question": question, "role": role},
            "questions": {
                "task": {
                    "type": "choice",
                    "instructions": (
                        "Nhiệm vụ chính của người dùng muốn OCee "
                        "(trợ lý Olympia Custom) thực hiện là gì?"
                    ),
                    "criteria": CRITERIA,
                }
            },
        }
        try:
            resp = await self._client.post(
                "/v1/systemone",
                json=payload,
                headers={"Authorization": f"Bearer {settings.typesafe_api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            answer = data["answers"]["task"]
            choice = str(answer.get("choice", ""))
            confidence = float(answer.get("confidence", 0.0))
        except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError) as exc:
            logger.warning("Jev router lỗi, dùng keyword fallback: %s", exc)
            return None
        if choice not in CRITERIA or choice == "other":
            return None
        return choice, confidence

    async def aclose(self) -> None:
        await self._client.aclose()
