"""AgentService — orchestrates one ask: cache → tool pre-pass → answer."""

from __future__ import annotations

import hashlib
import re

from app.domain.models import AgentError, AgentResponse, UserRole
from app.domain.ports import LLMClient
from app.tools.registry import (
    TOOL_SCHEMAS,
    tool_result_message,
)

SYSTEM_PROMPT_VI = (
    "Bạn là trợ lý khán giả/thí sinh của gameshow Olympia Custom. "
    "Trả lời ngắn gọn bằng tiếng Việt, dựa CHỈ vào dữ liệu tool trả về. "
    "Không suy diễn điểm số hay đáp án. Nếu tool không có dữ liệu, "
    "hãy nói không có thông tin. Tuyệt đối không tiết lộ đáp án câu hỏi "
    "cho thí sinh/khán giả. Nếu user hỏi đáp án, từ chối lịch sự. "
    "Khi nhắc thí sinh trên Discord, chỉ mention theo discord_nickname "
    "đã sync từ lookup_player_by_discord, không bịa mention."
)

CACHE_TTL_SECONDS = 3600

# Task write không cache — multistep (duyệt, resume) phải chạy thật.
NO_CACHE_TASKS = frozenset({"update", "place"})


class AgentService:

    def __init__(
        self,
        llm: LLMClient,
        snapshot_repo,
        gateway,  # ScoreRepo + QuestionRepo + TournamentRepo + MatchLookup
        cache=None,  # redis.asyncio.Redis | None
    ) -> None:
        self._llm = llm
        self._snapshot_repo = snapshot_repo
        self._gateway = gateway
        self._cache = cache

    async def ask(
        self,
        match_code: str,
        question: str,
        role: UserRole,
    ) -> AgentResponse:
        import time

        from app.graph import build_graph, route_task
        from app.metrics import ASK_DURATION, ASK_TOTAL, REFLECT_ROUNDS

        task = route_task(question)
        started = time.perf_counter()
        cacheable = task not in NO_CACHE_TASKS
        cache_key = self._cache_key(match_code, question, role) if cacheable else None
        if cacheable and self._cache is not None and cache_key is not None:
            cached = await self._cache.get(cache_key)
            if cached:
                response = AgentResponse.model_validate_json(cached)
                response.cached = True
                return response

        from app.observability import track_graph

        graph = track_graph(build_graph(), tags=["ocee", task])
        state = {
            "match_code": match_code,
            "question": question,
            "role": role,
            "task": task,
            "reflect_count": 0,
            "tools_used": [f"route:{task}"],
        }
        config = {
            "configurable": {
                "gateway": self._gateway,
                "llm": self._llm,
                "service": self,
                "thread_id": f"{match_code}:{question[:24]}",
            }
        }
        try:
            final = await graph.ainvoke(state, config)
        except Exception as exc:
            ASK_TOTAL.labels(task=task, status="error").inc()
            raise AgentError(f"Graph failed: {exc}") from exc

        answer = str(final.get("answer") or "")
        tools_used = list(final.get("tools_used") or [f"route:{task}"])
        if not answer:
            answer, llm_tools = await self._synthesize(question, final)
            tools_used = list(dict.fromkeys(tools_used + llm_tools))

        ASK_DURATION.labels(task=task).observe(time.perf_counter() - started)
        REFLECT_ROUNDS.labels(task=task).observe(float(final.get("reflect_count", 0) or 0))
        ASK_TOTAL.labels(task=task, status="ok").inc()

        response = AgentResponse(answer=answer, tools_used=tools_used)
        if cacheable and self._cache is not None and cache_key is not None:
            await self._cache.set(
                cache_key,
                response.model_dump_json(),
                ex=CACHE_TTL_SECONDS,
            )
        return response

    async def _synthesize(
        self, question: str, final: dict
    ) -> tuple[str, list[str]]:

        messages: list[dict] = [{"role": "user", "content": question}]
        for key in ("bank_row", "citations", "proposal", "critique", "apply_result", "search_rows"):
            if final.get(key) is not None:
                messages.append(tool_result_message(key, final[key]))
        for m in final.get("messages") or []:
            if isinstance(m, dict):
                messages.append(m)
        return await self._llm.chat_with_tools(
            SYSTEM_PROMPT_VI, messages, TOOL_SCHEMAS, max_tool_rounds=1
        )

    def _system_prompt(self) -> str:
        return SYSTEM_PROMPT_VI

    def _tool_schemas(self) -> list[dict]:
        return TOOL_SCHEMAS

    def _plan_tools(
        self, question: str, task: str = "qa"
    ) -> list[tuple[str, dict]]:
        return self._plan_tools_static(question, task)

    @staticmethod
    def _plan_tools_static(
        question: str, task: str = "qa"
    ) -> list[tuple[str, dict]]:
        q = question.lower()
        bank_code = AgentService._extract_bank_code(question)
        if task == "verify" and bank_code:
            return [("verify_bank_question", {"bank_code": bank_code})]
        if task == "update" and bank_code:
            return [("verify_bank_question", {"bank_code": bank_code})]
        if task == "place" and bank_code:
            m = re.search(r"(OC\d+_[A-Za-z0-9_-]+)", question)
            rnd = AgentService._extract_round(question)
            if m and rnd:
                return [
                    ("verify_bank_question", {"bank_code": bank_code}),
                    (
                        "place_question_to_match",
                        {
                            "bank_code": bank_code,
                            "match_code": m.group(1),
                            "round": rnd,
                        },
                    ),
                ]
            return [("verify_bank_question", {"bank_code": bank_code})]
        if task == "index" and bank_code:
            return [("verify_bank_question", {"bank_code": bank_code})]
        plan: list[tuple[str, dict]] = [("get_match_info", {})]
        if any(w in q for w in ("điểm", "dẫn đầu", "score", "top", "xếp")):
            plan.insert(0, ("get_scoreboard", {}))
        if any(w in q for w in ("câu hỏi", "câu ", "question")):
            plan.append(("get_questions", {}))
        if any(w in q for w in ("giải", "tournament", "bảng")):
            plan.append(("get_tournament_standings", {}))
        if any(
            w in q
            for w in ("discord", "nickname", "mention", "nhắc", "role", "vai trò")
        ):
            plan.append(
                (
                    "lookup_player_by_discord",
                    {"tournament_code": "", "nickname": question},
                )
            )
        return plan

    def _cache_key(self, match_code: str, question: str, role: UserRole) -> str:
        digest = hashlib.sha256(
            f"{match_code}:{role}:{question.lower().strip()}".encode()
        ).hexdigest()[:24]
        return f"agent:cache:{digest}"

    @staticmethod
    def _extract_bank_code(question: str) -> str | None:
        m = re.search(r"\bQB_[A-Z0-9_]{1,20}\b", question.upper())
        return m.group(0) if m else None

    @staticmethod
    def _extract_round(question: str) -> str | None:
        q = question.lower()
        if "bứt phá" in q or "but pha" in q or re.search(r"\bbp\b", q):
            return "BP"
        if "khởi động chung" in q or "khoi dong chung" in q:
            return "KD_C"
        if "khởi động riêng" in q or "khoi dong rieng" in q:
            return "KD_R"
        if "về đích" in q or "ve dich" in q or re.search(r"\bvd\b", q):
            return "VD"
        if "giải mã" in q or "giai ma" in q or re.search(r"\bgm\b", q):
            return "GM"
        return None
