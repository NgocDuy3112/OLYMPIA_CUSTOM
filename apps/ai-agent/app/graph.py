"""OCee graph — read-only. Router + graph trả lời, không bao giờ ghi.

Nodes:
  intake   — route_task(question) → qa/verify/index/assist/refuse
  verify   — get_bank_row + search_external (read-only, ghi bank_row/citations)
  search   — search_bank theo q/round_hint (task index/tìm lại)
  assist   — suggest_bank_review (read-only, admin quyết cuối)
  qa       — flow Q&A (scoreboard/match/questions)
  refuse   — yêu cầu ghi (update/place) → chỉ dẫn dùng UI qauthor

Write tools (update/place/propose) gỡ khỏi TOOL_SCHEMAS + chặn ở
execute_tool (guard 403) — Ocee không bao giờ ghi bank.

Gateway inject qua config["gateway"], llm qua config["llm"] để node gọi
tool thật. ask() invoke graph, không chạy _plan_tools tay nữa.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal

try:
    from langgraph.graph import RunnableConfig
except ImportError:
    RunnableConfig = dict  # type: ignore

from typing_extensions import TypedDict

TaskKind = Literal["verify", "index", "qa", "assist", "refuse"]


def _merge_list(left: list | None, right: list | None) -> list:
    return list(left or []) + list(right or [])


class AgentState(TypedDict, total=False):
    """Graph state — TypedDict + reducers để LangGraph merge đúng."""

    match_code: str
    question: str
    role: str
    user_code: str
    task: str
    bank_code: str | None
    bank_row: dict | None
    citations: list
    messages: Annotated[list, _merge_list]
    tools_used: Annotated[list, _merge_list]
    answer: str
    search_rows: list
    verify_error: str | None
    search_error: str | None


def route_task(question: str) -> TaskKind:
    """Router keyword — fallback của Jev router (AgentService._route).

    Yêu cầu ghi (update/place) kèm mã QB_* → refuse: Ocee read-only,
    chỉ dẫn người dùng ghi qua UI qauthor.
    """
    import re

    q = question.lower()
    write_words = (
        "sửa",
        "sua",
        "cập nhật",
        "cap nhat",
        "update",
        "vào trận",
        "place",
        "pick",
        "chèn",
        "đặt câu",
    )
    if any(w in q for w in write_words) and re.search(r"QB_", question, re.IGNORECASE):
        return "refuse"
    if any(w in q for w in ("duyệt", "duyet", "review", "approve", "ý kiến", "y kien", "có nên")):
        return "assist"
    if any(w in q for w in ("index", "đánh index", "tag", "tìm lại")):
        return "index"
    if any(w in q for w in ("check", "kiểm tra", "kiem tra", "chính xác", "verify", "qb_")):
        return "verify"
    return "qa"


def build_graph(checkpointer: Any | None = None) -> Any:
    """Dựng StateGraph OCee. checkpointer=None → chạy không persist (test)."""
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(AgentState)
    builder.add_node("intake", _intake_node)
    builder.add_node("verify", _verify_node)
    builder.add_node("search", _search_node)
    builder.add_node("qa", _qa_node)
    builder.add_node("assist", _assist_node)
    builder.add_node("refuse", _refuse_node)

    builder.add_edge(START, "intake")
    builder.add_conditional_edges(
        "intake",
        lambda s: s.get("task", "qa"),
        {
            "verify": "verify",
            "index": "search",
            "qa": "qa",
            "assist": "assist",
            # Task legacy (update/place) còn sót → refuse, không ghi.
            "update": "refuse",
            "place": "refuse",
            "refuse": "refuse",
        },
    )
    builder.add_edge("verify", END)
    builder.add_edge("search", END)
    builder.add_edge("qa", END)
    builder.add_edge("assist", END)
    builder.add_edge("refuse", END)

    if checkpointer is not None:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()


async def _intake_node(state: AgentState) -> dict:
    # Task do service route trước (Jev router) — thiếu mới fallback keyword.
    if state.get("task"):
        return {}
    return {"task": route_task(str(state.get("question", "")))}


async def _verify_node(state: AgentState, config: RunnableConfig) -> dict:
    """Read-only: bank row + citations nguồn ngoài."""
    from app.tools.registry import execute_tool

    ctx = _tool_context(state, config)
    bank_code = _bank_code(state)
    if not bank_code:
        return {"bank_row": None, "citations": []}
    try:
        row = await execute_tool("verify_bank_question", {"bank_code": bank_code}, ctx)
    except Exception as exc:  # noqa: BLE001
        return {"bank_row": None, "citations": [], "verify_error": str(exc)}
    citations: list[dict] = []
    try:
        ext = await execute_tool("search_external", {"query": str(row.get("content", ""))}, ctx)
        if isinstance(ext, dict) and isinstance(ext.get("citations"), list):
            citations = ext["citations"]
    except Exception:  # noqa: BLE001
        citations = []
    out: dict = {"bank_row": row, "citations": citations}
    tools = list(state.get("tools_used") or []) + ["verify_bank_question"]
    out["tools_used"] = tools
    return out


async def _search_node(state: AgentState, config: RunnableConfig) -> dict:
    from app.tools.registry import execute_tool

    ctx = _tool_context(state, config)
    q = str(state.get("question", ""))
    try:
        rows = await execute_tool(
            "search_bank", {"q": q, "round_hint": ""}, ctx
        )
    except Exception as exc:  # noqa: BLE001
        return {"search_rows": [], "search_error": str(exc)}
    tools = list(state.get("tools_used") or []) + ["search_bank"]
    return {"search_rows": rows, "tools_used": tools}


async def _assist_node(state: AgentState, config: RunnableConfig) -> dict:
    """Hỗ trợ duyệt: gợi ý read-only (row + tương tự), admin quyết cuối."""
    import re

    from app.tools.registry import execute_tool

    ctx = _tool_context(state, config)
    m = re.search(r"\bQB_[A-Z0-9_]{1,20}\b", str(state.get("question", "")).upper())
    if not m:
        return {"search_rows": [], "search_error": "Thiếu mã bank QB_*."}
    try:
        suggestion = await execute_tool(
            "suggest_bank_review", {"bank_code": m.group(0)}, ctx
        )
    except Exception as exc:  # noqa: BLE001
        return {"search_rows": [], "search_error": str(exc)}
    tools = list(state.get("tools_used") or []) + ["suggest_bank_review"]
    return {"search_rows": [suggestion], "tools_used": tools}


async def _refuse_node(state: AgentState) -> dict:
    """Yêu cầu ghi (update/place) — Ocee read-only, chỉ dẫn dùng UI."""
    return {
        "answer": (
            "Ocee chỉ đọc dữ liệu — mình không sửa câu hay bỏ câu vào trận. "
            "Hãy dùng trang qauthor (panel sửa câu / bộ đề) để ghi thay đổi; "
            "mình có thể đối chiếu (verify) hay gợi ý duyệt (assist) giúp."
        ),
    }


async def _qa_node(state: AgentState, config: RunnableConfig) -> dict:
    from app.tools.registry import execute_tool, tool_result_message

    llm = _config_value(config, "llm")
    if llm is None:
        return {}
    from app.services.agent_service import AgentService


    plan = AgentService._plan_tools_static(str(state.get("question", "")), "qa")
    ctx = _tool_context(state, config)
    messages: list[dict] = [{"role": "user", "content": str(state.get("question", ""))}]
    tools: list[str] = []
    for name, args in plan:
        try:
            result = await execute_tool(name, args, ctx)
            messages.append(tool_result_message(name, result))
            tools.append(name)
        except Exception as exc:  # noqa: BLE001
            messages.append(tool_result_message(name, {"error": str(exc)}))
    answer, llm_tools = await llm.chat_with_tools(
        _qa_system_prompt(), messages, _qa_tool_schemas(), max_tool_rounds=3
    )
    return {
        "messages": messages,
        "tools_used": list(state.get("tools_used") or []) + tools + list(llm_tools),
        "answer": answer,
    }


def _qa_system_prompt() -> str:
    from app.services.agent_service import SYSTEM_PROMPT_VI

    return SYSTEM_PROMPT_VI


def _qa_tool_schemas() -> list[dict]:
    from app.tools.registry import TOOL_SCHEMAS

    return TOOL_SCHEMAS


def _config_value(config: RunnableConfig, key: str) -> Any:
    # LangGraph truyen RunnableConfig (dict-like) — doc truc tiep.
    try:
        if config is None:
            return None
        conf = config.get("configurable", {}) if hasattr(config, "get") else {}
        if isinstance(conf, dict):
            return conf.get(key)
    except Exception:  # noqa: BLE001
        return None
    return None


def _tool_context(state: AgentState, config: RunnableConfig) -> Any:
    from app.tools.registry import ToolContext

    snapshot_repo = _config_value(config, "snapshot_repo")
    score_repo = _config_value(config, "score_repo")
    question_repo = _config_value(config, "question_repo")
    bank_repo = _config_value(config, "bank_repo")
    discord_repo = _config_value(config, "discord_repo")
    missing = [
        name
        for name, repo in (
            ("snapshot_repo", snapshot_repo),
            ("score_repo", score_repo),
            ("question_repo", question_repo),
            ("bank_repo", bank_repo),
            ("discord_repo", discord_repo),
        )
        if repo is None
    ]
    if missing:
        raise RuntimeError(f"Graph thiếu repos: {','.join(missing)}")
    return ToolContext(
        snapshot_repo=snapshot_repo,
        score_repo=score_repo,
        question_repo=question_repo,
        tournament_repo=question_repo,
        match_lookup=question_repo,
        role=state.get("role", "qauthor"),
        match_code=str(state.get("match_code", "")),
        discord_repo=discord_repo,
        bank_repo=bank_repo,
    )


def _bank_code(state: AgentState) -> str | None:
    import re

    q = str(state.get("question", "")).upper()
    m = re.search(r"\bQB_[A-Z0-9_]{1,20}\b", q)
    if m:
        return m.group(0)
    row = state.get("bank_row") or {}
    code = str(row.get("bankCode") or row.get("bank_code") or "")
    return code.upper() or None



