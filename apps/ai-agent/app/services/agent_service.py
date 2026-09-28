from __future__ import annotations

import hashlib

from app.domain.models import AgentError, AgentResponse, UserRole
from app.utils.tools import (
    tool_result_message,
)

CACHE_TTL_SECONDS = 3600


class AgentService:

    def __init__(
        self,
        cache=None,  # redis.asyncio.Redis | None
        router=None,  # JevRouter | None — None → keyword fallback
        model=None,  # BaseChatModel — prod ChatOpenRouter / test fake
        models=None,  # dict[task, BaseChatModel] — model riêng từng subagent
        mcp=None,  # shared FastMCP Client | None — None → agent không tools
    ) -> None:
        self._cache = cache
        self._router = router
        self._model = model
        self._models = dict(models or {})
        self._mcp = mcp

    def model_for(self, task: str):
        """Model của subagent — fallback model chung khi task không override."""
        return self._models.get(task) or self._model

    async def ask(
        self,
        match_code: str,
        question: str,
        role: UserRole,
    ) -> AgentResponse:
        import time

        from app.agent import build_graph
        from app.metrics import ASK_DURATION, ASK_TOTAL

        started = time.perf_counter()
        cache_key = self.cache_key(match_code, question, role)
        if self._cache is not None:
            cached = await self._cache.get(cache_key)
            if cached:
                response = AgentResponse.model_validate_json(cached)
                response.cached = True
                return response

        # Route nằm trong graph (node "route") — cache hit không tốn call Jev.
        graph = build_graph()
        state = {
            "match_code": match_code,
            "question": question,
            "role": role,
            "tools_used": [],
        }
        from app.utils.state import AgentContext

        context = AgentContext(
            model=self._model,
            models=self._models,
            mcp=self._mcp,
            router=self._router,
        )
        try:
            final = await graph.ainvoke(state, context=context)
        except Exception as exc:
            ASK_TOTAL.labels(task="unknown", status="error").inc()
            raise AgentError(f"Graph failed: {exc}") from exc

        task = str(final.get("task") or "unknown")
        answer = str(final.get("answer") or "")
        tools_used = list(final.get("tools_used") or [])
        if not answer:
            answer, llm_tools = await self.synthesize(question, final)
            tools_used = list(dict.fromkeys(tools_used + llm_tools))

        from app.observability import current_trace_id

        trace_id = current_trace_id()
        ASK_DURATION.labels(task=task).observe(
            time.perf_counter() - started,
            exemplar={"traceID": trace_id} if trace_id else None,
        )
        ASK_TOTAL.labels(task=task, status="ok").inc()

        response = AgentResponse(answer=answer, tools_used=tools_used)
        if self._cache is not None:
            await self._cache.set(
                cache_key,
                response.model_dump_json(),
                ex=CACHE_TTL_SECONDS,
            )
        return response

    async def synthesize(
        self, question: str, final: dict
    ) -> tuple[str, list[str]]:

        messages: list[dict] = [{"role": "user", "content": question}]
        for key in ("bank_row", "citations", "search_rows"):
            if final.get(key) is not None:
                messages.append(tool_result_message(key, final[key]))
        for m in final.get("messages") or []:
            if isinstance(m, dict):
                messages.append(m)
        from langchain_core.messages import HumanMessage, SystemMessage

        from app.utils.nodes import scope_for_task

        system = scope_for_task(str(final.get("task") or "qa"))
        lc_messages = [SystemMessage(content=system)]
        for m in messages:
            content = m.get("content", "")
            if not isinstance(content, str):
                import json

                content = json.dumps(content, ensure_ascii=False, default=str)
            lc_messages.append(HumanMessage(content=content))
        result = await self.model_for(str(final.get("task") or "qa")).ainvoke(lc_messages)
        return str(result.content or ""), []

    def system_prompt(self) -> str:
        from app.utils.nodes import scope_for_task

        return scope_for_task("qa")

    def cache_key(self, match_code: str, question: str, role: UserRole) -> str:
        digest = hashlib.sha256(
            f"{match_code}:{role}:{question.lower().strip()}".encode()
        ).hexdigest()[:24]
        return f"agent:cache:{digest}"


