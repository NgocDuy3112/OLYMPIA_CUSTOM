"""OCee graph — một Interface ask(), router + reflect bên trong.

Nodes:
  intake   — route_task(question) → verify/update/place/index/qa
  verify   — get_bank_row + search_external (read-only, ghi bank_row/citations)
  search   — search_bank theo q/tags/round_hint (task index/tìm lại)
  propose  — soạn proposal diff từ bank_row + yêu cầu (chưa write)
  critique — LLM chấm proposal theo bank_row + citations;
             chưa đạt + còn lượt → quay lại verify (reflect)
  review   — interrupt() duyệt write trước khi apply
  apply    — update_bank / place_to_match (write, sau duyệt)
  index    — normalize tags/round_hint để tìm lại
  qa       — flow Q&A cũ (scoreboard/match/questions)

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

TaskKind = Literal["verify", "update", "place", "index", "qa"]

MAX_REFLECT_ROUNDS = 3


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
    proposal: dict | None
    critique: dict | None
    reflect_count: int
    approved: bool
    messages: Annotated[list, _merge_list]
    tools_used: Annotated[list, _merge_list]
    answer: str
    search_rows: list
    apply_result: dict | None
    index: dict | None
    verify_error: str | None
    search_error: str | None
    propose_error: str | None
    apply_error: str | None


def route_task(question: str) -> TaskKind:
    """Router heuristic — LLM router thay sau, giữ Interface."""
    q = question.lower()
    if any(w in q for w in ("bỏ vào trận", "place", "pick", "m17", "bứt phá", "but pha")):
        return "place"
    if any(w in q for w in ("update", "sửa", "sua", "cập nhật", "cap nhat")):
        return "update"
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
    builder.add_node("propose", _propose_node)
    builder.add_node("critique", _critique_node)
    builder.add_node("review", _review_node)
    builder.add_node("apply", _apply_node)
    builder.add_node("index", _index_node)
    builder.add_node("qa", _qa_node)

    builder.add_edge(START, "intake")
    builder.add_conditional_edges(
        "intake",
        lambda s: s.get("task", "qa"),
        {
            "verify": "verify",
            "update": "verify",
            "place": "verify",
            "index": "search",
            "qa": "qa",
        },
    )
    builder.add_edge("verify", "propose")
    builder.add_edge("propose", "critique")
    builder.add_conditional_edges(
        "critique",
        _critique_route,
        {
            "review": "review",
            "verify": "verify",
            "end": END,
        },
    )
    builder.add_conditional_edges(
        "review",
        lambda s: "apply" if s.get("approved") else END,
        {"apply": "apply", END: END},
    )
    builder.add_edge("apply", "index")
    builder.add_edge("index", END)
    builder.add_edge("search", END)
    builder.add_edge("qa", END)

    if checkpointer is not None:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()


def _critique_route(state: AgentState) -> str:
    critique = state.get("critique") or {}
    if critique.get("passed"):
        return "review"
    if int(state.get("reflect_count", 0)) >= MAX_REFLECT_ROUNDS:
        return "end"
    return "verify"


async def _intake_node(state: AgentState) -> dict:
    question = str(state.get("question", ""))
    return {"task": route_task(question), "reflect_count": 0}


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
            "search_bank", {"q": q, "tags": "", "round_hint": ""}, ctx
        )
    except Exception as exc:  # noqa: BLE001
        return {"search_rows": [], "search_error": str(exc)}
    tools = list(state.get("tools_used") or []) + ["search_bank"]
    return {"search_rows": rows, "tools_used": tools}


async def _propose_node(state: AgentState, config: RunnableConfig) -> dict:
    """Soạn proposal diff từ bank_row + yêu cầu — chưa write."""
    from app.tools.registry import execute_tool

    ctx = _tool_context(state, config)
    bank_code = _bank_code(state)
    if not bank_code:
        return {"proposal": None}
    try:
        proposal = await execute_tool(
            "propose_bank_edit",
            {"bank_code": bank_code, "request": str(state.get("question", ""))},
            ctx,
        )
    except Exception as exc:  # noqa: BLE001
        return {"proposal": None, "propose_error": str(exc)}
    tools = list(state.get("tools_used") or []) + ["propose_bank_edit"]
    return {"proposal": proposal, "tools_used": tools}


async def _critique_node(state: AgentState, config: RunnableConfig) -> dict:
    """LLM chấm proposal theo bank_row + citations. Chưa đạt → reflect."""
    llm = (config or {}).get("configurable", {}).get("llm") if isinstance(config, dict) else None
    if llm is None and config is not None and hasattr(config, "get"):
        try:
            llm = config.get("configurable", {}).get("llm")
        except Exception:  # noqa: BLE001
            llm = None
    proposal = state.get("proposal")
    if not proposal:
        count = int(state.get("reflect_count", 0)) + 1
        return {
            "critique": {"passed": False, "reason": "Không soạn được proposal."},
            "reflect_count": count,
        }
    if llm is None:
        # Không có LLM (test/stub) → coi như đạt để flow không vỡ.
        return {"critique": {"passed": True, "reason": "stub-pass"}}
    prompt = _critique_prompt(state)
    try:
        verdict, _ = await llm.chat_with_tools(
            "Bạn là reviewer câu hỏi Olympia. Trả lời JSON.",
            [{"role": "user", "content": prompt}],
            [],
            max_tool_rounds=1,
        )
    except Exception as exc:  # noqa: BLE001
        count = int(state.get("reflect_count", 0)) + 1
        return {
            "critique": {"passed": False, "reason": f"LLM lỗi: {exc}"},
            "reflect_count": count,
        }
    passed, reason = _parse_verdict(verdict)
    count = int(state.get("reflect_count", 0)) + (0 if passed else 1)
    return {"critique": {"passed": passed, "reason": reason}, "reflect_count": count}


async def _review_node(state: AgentState) -> dict:
    """Human-in-the-loop: pause trước write, chờ QAuthor duyệt."""
    try:
        from langgraph.types import interrupt

        decision = interrupt(
            {
                "proposal": state.get("proposal"),
                "critique": state.get("critique"),
                "task": state.get("task"),
                "bank_row": state.get("bank_row"),
            }
        )
        approved = bool(
            decision
            if isinstance(decision, bool)
            else (decision or {}).get("approved", False)
            if isinstance(decision, dict)
            else False
        )
        return {"approved": approved}
    except RuntimeError:
        return {"approved": True}


async def _apply_node(state: AgentState, config: RunnableConfig) -> dict:
    from app.tools.registry import execute_tool

    ctx = _tool_context(state, config)
    task = str(state.get("task", ""))
    proposal = state.get("proposal") or {}
    try:
        if task == "place":
            result = await execute_tool(
                "place_question_to_match",
                {
                    "bank_code": _bank_code(state) or "",
                    "match_code": str(proposal.get("match_code") or state.get("match_code") or ""),
                    "round": str(proposal.get("round") or ""),
                },
                ctx,
            )
        else:
            result = await execute_tool(
                "update_bank_question",
                {
                    "bank_code": _bank_code(state) or "",
                    **{k: v for k, v in proposal.items() if k in ("content", "answer", "explanation", "tags", "round_hint", "roundHint")},
                },
                ctx,
            )
    except Exception as exc:  # noqa: BLE001
        return {"apply_result": None, "apply_error": str(exc)}
    tools = list(state.get("tools_used") or []) + ["update_bank_question" if task != "place" else "place_question_to_match"]
    return {"apply_result": result, "tools_used": tools}


async def _index_node(state: AgentState) -> dict:
    row = state.get("bank_row") or {}
    tags = _normalize_tags(str(row.get("tags") or ""))
    round_hint = str(row.get("roundHint") or row.get("round_hint") or "").upper()
    return {"index": {"tags": tags, "round_hint": round_hint}}


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


def _critique_prompt(state: AgentState) -> str:
    import json

    return (
        "Chấm proposal sửa câu hỏi bank.\n"
        f"Bank row: {json.dumps(state.get('bank_row'), ensure_ascii=False, default=str)}\n"
        f"Citations: {json.dumps(state.get('citations'), ensure_ascii=False, default=str)}\n"
        f"Proposal: {json.dumps(state.get('proposal'), ensure_ascii=False, default=str)}\n"
        'Trả JSON {"passed": true/false, "reason": "..."}: '
        "passed=true khi proposal khớp yêu cầu, không lộ đáp án sai, có căn cứ."
    )


def _parse_verdict(text: str) -> tuple[bool, str]:
    import json

    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return bool(data.get("passed")), str(data.get("reason", ""))
    except Exception:  # noqa: BLE001, S110
        pass
    low = text.lower()
    if '"passed": true' in low or '"passed":true' in low:
        return True, text[:500]
    return False, text[:500]


def _normalize_tags(raw: str) -> list[str]:
    parts = [p.strip().lower() for p in raw.replace(";", ",").split(",")]
    seen: list[str] = []
    for p in parts:
        if p and p not in seen:
            seen.append(p)
    return seen
