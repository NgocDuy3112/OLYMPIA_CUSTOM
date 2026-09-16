"""AgentService — orchestrates one ask: cache → tool pre-pass → answer."""

from __future__ import annotations

import hashlib

from app.domain.models import AgentError, AgentResponse, UserRole
from app.domain.ports import LLMClient
from app.tools.registry import (
    MAX_TOOL_ROUNDS,
    TOOL_SCHEMAS,
    ToolContext,
    execute_tool,
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

CACHE_TTL_SECONDS = 60


class AgentService:
    """One ask = at most MAX_TOOL_ROUNDS tool calls + one synthesis."""

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
        user_code: str,
    ) -> AgentResponse:
        cache_key = self._cache_key(match_code, question)
        if self._cache is not None:
            cached = await self._cache.get(cache_key)
            if cached:
                response = AgentResponse.model_validate_json(cached)
                response.cached = True
                return response

        ctx = ToolContext(
            snapshot_repo=self._snapshot_repo,
            score_repo=self._gateway,
            question_repo=self._gateway,
            tournament_repo=self._gateway,
            match_lookup=self._gateway,
            role=role,
            match_code=match_code,
            discord_repo=self._gateway,
        )

        messages: list[dict] = [{"role": "user", "content": question}]
        tools_used: list[str] = []

        for name, args in self._plan_tools(question):
            try:
                result = await execute_tool(name, args, ctx)
                messages.append(tool_result_message(name, result))
                tools_used.append(name)
            except AgentError as error:
                # Tool failure → skip; LLM answers from remaining context.
                messages.append(tool_result_message(name, {"error": error.message}))
                continue

        answer, llm_tools_used = await self._llm.chat_with_tools(
            SYSTEM_PROMPT_VI,
            messages,
            TOOL_SCHEMAS,
            max_tool_rounds=MAX_TOOL_ROUNDS,
        )
        tools_used = list(dict.fromkeys(tools_used + llm_tools_used))

        response = AgentResponse(answer=answer, tools_used=tools_used)
        if self._cache is not None:
            await self._cache.set(
                cache_key,
                response.model_dump_json(),
                ex=CACHE_TTL_SECONDS,
            )
        return response

    def _plan_tools(self, question: str) -> list[tuple[str, dict]]:
        """Heuristic tool selection. Provider adapters with native
        tool-calling replace this loop entirely."""
        q = question.lower()
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

    def _cache_key(self, match_code: str, question: str) -> str:
        digest = hashlib.sha256(
            f"{match_code}:{question.lower().strip()}".encode()
        ).hexdigest()[:24]
        return f"agent:cache:{digest}"
