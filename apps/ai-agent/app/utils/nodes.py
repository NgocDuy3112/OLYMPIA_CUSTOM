from __future__ import annotations

from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain_core.messages import AIMessage
from langgraph.runtime import Runtime

from app.utils.state import AgentContext, AgentState, TrackKind

PROMPTS_DIR = Path(__file__).resolve().parent.parent / "prompts"


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.txt").read_text(encoding="utf-8").strip()


RULES_VI = load_prompt("rules")
QA_SYSTEM = load_prompt("qa") + "\n" + RULES_VI
BANK_SYSTEM = load_prompt("bank")
OPS_SYSTEM = load_prompt("ops")
REASON_SYSTEM = load_prompt("reason")
FACT_SYSTEM = load_prompt("fact")
FRESH_SYSTEM = load_prompt("fresh")


def scope_for_task(task: str) -> str:
    """System prompt theo task — tools lấy từ MCP adapter."""
    if task == "ops":
        return OPS_SYSTEM
    if task in ("verify", "index", "assist"):
        return BANK_SYSTEM
    return QA_SYSTEM


async def route_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
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


MCP_READ_TOOLS = frozenset(
    {
        "list_matches",
        "get_match",
        "get_scoreboard",
        "list_questions",
        "get_question",
        "list_answers",
        "get_question_answers",
        "search_bank",
        "list_tournaments",
        "get_tournament",
        "get_standings",
        "grade_question",
    }
)
TASK_MCP_TOOLS: dict[str, frozenset] = {
    "qa": MCP_READ_TOOLS,
    # bank tasks: đọc + bank_create (soạn) + grade_llm (judge).
    "verify": MCP_READ_TOOLS | {"grade_llm"},
    "index": MCP_READ_TOOLS | {"bank_create"},
    "assist": MCP_READ_TOOLS | {"bank_create", "grade_llm"},
    # ops: đọc + chấm/ghi điểm qua engine.
    "ops": MCP_READ_TOOLS | {"score_calculate", "score_adjust"},
    # track soạn/kiểm tra — kế thừa read + bank/judge.
    "reason": MCP_READ_TOOLS | {"bank_create", "grade_llm"},
    "fact": MCP_READ_TOOLS | {"bank_create", "grade_llm"},
    "fresh": MCP_READ_TOOLS | {"bank_create", "grade_llm"},
}

TRACK_SUBAGENT: dict[TrackKind, str] = {
    "reason": "reason_agent",
    "fact": "fact_agent",
    "fresh": "fresh_agent",
}


async def mcp_tools_for(task: str, shared: Any | None = None) -> list:
    """Tools MCP cho task — shared connection có sẵn thì reuse (nested),
    không thì mở mới. MCP chết → [] (agent chạy chay, không tools)."""
    from fastmcp.client import Client
    from langchain.mcp import MCPAdapter

    from app.config import settings

    url = settings.mcp_base_url.rstrip("/") + "/mcp"
    allow = TASK_MCP_TOOLS.get(task, MCP_READ_TOOLS)
    try:
        if shared is not None:
            adapter = MCPAdapter(shared)
        elif settings.mcp_token:
            adapter = MCPAdapter(Client(url, auth=settings.mcp_token))
        else:
            adapter = MCPAdapter(Client(url))
        async with adapter as entered:
            tools = await entered.list_tools()
    except Exception:  # noqa: BLE001 — MCP chết thì fallback internal
        return []
    return [t for t in tools if t.name in allow]


async def agent_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Chạy create_agent của task — prompt + tools MCP theo subagent."""
    model = runtime.context["model"]
    task = str(state.get("task") or "qa")
    per_task = runtime.context.get("models") or {}
    if task in per_task:
        model = per_task[task]
    if model is None:
        return {}
    system = scope_for_task(task)
    tools = await mcp_tools_for(task, runtime.context.get("mcp"))
    question = str(state.get("question", ""))
    return await _run_create_agent(model, system, tools, question, "")


async def _run_create_agent(
    model: Any | None,
    system: str,
    tools: list,
    question: str,
    tag: str,
) -> dict:
    """Chạy 1 create_agent — dùng chung cho agent_node và 3 track nodes."""
    if model is None:
        return {}
    agent = create_agent(model, tools=tools, system_prompt=system)
    result = await agent.ainvoke({"messages": [{"role": "user", "content": question}]})
    messages = list(result.get("messages") or [])
    answer = ""
    used: list[str] = [tag] if tag else []
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


async def track_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Tier-2: Jev chọn track (reason/fact/fresh) cho task verify/assist.
    Thiếu router/lỗi/dưới ngưỡng → bank_agent chung (fail-open)."""
    from app.config import settings
    from app.metrics import ROUTE_CONF, ROUTE_SRC

    question = str(state.get("question", ""))
    router = (runtime.context or {}).get("router")
    track = None
    if router is not None:
        try:
            jev = await router.route_track(question)
        except Exception:  # noqa: BLE001 — router không được làm ask chết
            jev = None
        if jev is None:
            ROUTE_SRC.labels(source="jev_error").inc()
        else:
            candidate, confidence = jev
            ROUTE_CONF.labels(task=f"track:{candidate}").observe(confidence)
            if confidence >= settings.jev_min_confidence:
                ROUTE_SRC.labels(source="jev").inc()
                track = candidate
            else:
                ROUTE_SRC.labels(source="jev_low_conf").inc()
    else:
        ROUTE_SRC.labels(source="no_router").inc()
    subagent = TRACK_SUBAGENT.get(track or "", "bank_agent")
    return {"track": track or "bank", "subagent": subagent, "tools_used": [f"track:{track or 'bank'}"]}


def _track_model(
    state: AgentState, runtime: Runtime[AgentContext], key: str
) -> tuple[Any | None, str]:
    per_task = runtime.context.get("models") or {}
    return per_task.get(key) or runtime.context["model"], str(
        state.get("question", "")
    )


async def reason_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Subagent track suy luận — create_agent riêng."""
    model, question = _track_model(state, runtime, "reason")
    tools = await mcp_tools_for("reason", runtime.context.get("mcp"))
    return await _run_create_agent(model, REASON_SYSTEM, tools, question, "agent:reason")


async def fact_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Subagent track fact/lịch sử — create_agent riêng."""
    model, question = _track_model(state, runtime, "fact")
    tools = await mcp_tools_for("fact", runtime.context.get("mcp"))
    return await _run_create_agent(model, FACT_SYSTEM, tools, question, "agent:fact")


async def fresh_node(state: AgentState, runtime: Runtime[AgentContext]) -> dict:
    """Subagent track cập nhật nguồn — create_agent riêng."""
    model, question = _track_model(state, runtime, "fresh")
    tools = await mcp_tools_for("fresh", runtime.context.get("mcp"))
    return await _run_create_agent(model, FRESH_SYSTEM, tools, question, "agent:fresh")
