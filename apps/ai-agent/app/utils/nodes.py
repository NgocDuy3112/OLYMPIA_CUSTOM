from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage
from langgraph.runtime import Runtime

from app.utils.state import AgentContext, AgentState

# ── Prompt đọc từ file text — sửa trực tiếp app/prompts/*.txt.
# rules.txt port từ apps/web/src/pages/info/RulesPage.tsx (SECTIONS) —
# sửa RulesPage → sync lại rules.txt (2 nguồn chấp nhận).
PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8").strip()


RULES_VI = load_prompt("rules")
QA_SYSTEM = load_prompt("qa") + "\n" + RULES_VI
BANK_SYSTEM = load_prompt("bank")
OPS_SYSTEM = load_prompt("ops")


def scope_for_task(task: str) -> tuple[str, list[dict]]:
    """(system_prompt, tool_schemas) theo task — node agent dùng."""
    from app.utils.tools import BANK_TOOLS, OPS_TOOLS, QA_TOOLS

    if task == "ops":
        return OPS_SYSTEM, OPS_TOOLS
    if task in ("verify", "index", "assist"):
        return BANK_SYSTEM, BANK_TOOLS
    return QA_SYSTEM, QA_TOOLS


async def route_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Node router — Jev Choice (System One) là router DUY NHẤT, không keyword.

    Thiếu router / Jev lỗi / confidence dưới ngưỡng → task mặc định "qa"
    (read-only, an toàn) — fail-open, ask không bao giờ chết vì router.
    """
    from app.agent import TASK_SUBAGENT
    from app.config import settings
    from app.metrics import ROUTE_CONF, ROUTE_SRC

    question = str(state.get("question", ""))
    role = str(state.get("role", ""))
    router = (runtime.context or {}).get("router")
    task = None
    if router is None:
        ROUTE_SRC.labels(source="no_router").inc()
    else:
        try:
            jev = await router.route(question, role)
        except Exception:  # noqa: BLE001 — router không được làm ask chết
            jev = None
        if jev is None:
            ROUTE_SRC.labels(source="jev_error").inc()
        else:
            candidate, confidence = jev
            ROUTE_CONF.labels(task=candidate).observe(confidence)
            if confidence >= settings.jev_min_confidence:
                ROUTE_SRC.labels(source="jev").inc()
                task = candidate
            else:
                ROUTE_SRC.labels(source="jev_low_conf").inc()
    if task is None:
        task = "qa"  # fallback không heuristic — read-only, scope hẹp nhất
    return {
        "task": task,
        "subagent": TASK_SUBAGENT.get(task),
        "tools_used": [f"route:{task}"],
    }


async def refuse_node(state: AgentState) -> dict:
    """Yêu cầu ghi (update/place) — Ocee read-only, chỉ dẫn dùng UI."""
    return {
        "answer": (
            "Ocee chỉ đọc dữ liệu — mình không sửa câu hay bỏ câu vào trận. "
            "Hãy dùng trang qauthor (panel sửa câu / bộ đề) để ghi thay đổi; "
            "mình có thể đối chiếu (verify) hay gợi ý duyệt (assist) giúp."
        ),
    }


async def agent_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Chạy create_agent của task — prompt + tools theo subagent."""
    from app.utils.tools import lc_tools

    model = runtime.context["model"]
    if model is None:
        return {}
    task = str(state.get("task") or "qa")
    system, schemas = scope_for_task(task)
    ctx = tool_context(state, runtime.context)
    agent = create_agent(
        model,
        tools=lc_tools(schemas, ctx),
        system_prompt=system,
    )
    question = str(state.get("question", ""))
    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": question}]}
    )
    messages = list(result.get("messages") or [])
    answer = ""
    used: list[str] = []
    plain: list[dict] = []
    for m in messages:
        plain.append(
            {
                "role": getattr(m, "type", "unknown"),
                "content": str(getattr(m, "content", "")),
            }
        )
        for tc in getattr(m, "tool_calls", None) or []:
            used.append(str(tc.get("name") if isinstance(tc, dict) else tc.name))
        if isinstance(m, AIMessage) and str(m.content or "").strip():
            answer = str(m.content)
    # tools_used/messages có reducer — trả về CHỈ phần mới, không cộng lại.
    return {"messages": plain, "tools_used": used, "answer": answer}


def tool_context(state: AgentState, context: AgentContext) -> Any:
    from app.utils.tools import ToolContext

    return ToolContext(
        snapshot_repo=context["snapshot_repo"],
        score_repo=context["score_repo"],
        question_repo=context["question_repo"],
        tournament_repo=context["question_repo"],
        match_lookup=context["question_repo"],
        role=state.get("role", "qauthor"),
        match_code=str(state.get("match_code", "")),
        discord_repo=context["discord_repo"],
        bank_repo=context["bank_repo"],
    )
