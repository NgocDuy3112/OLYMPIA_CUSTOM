from __future__ import annotations

from typing import Annotated, Any, Literal

from typing_extensions import TypedDict

TaskKind = Literal["verify", "index", "qa", "ops", "assist", "refuse"]

TrackKind = Literal["reason", "fact", "fresh"]


def merge_list(left: list | None, right: list | None) -> list:
    return list(left or []) + list(right or [])


class AgentState(TypedDict, total=False):
    """Graph state — TypedDict; list field merge bằng reducer merge_list."""

    match_code: str
    question: str
    role: str
    user_code: str
    task: str
    track: str
    subagent: str | None
    bank_code: str | None
    bank_row: dict | None
    citations: list
    messages: Annotated[list, merge_list]
    tools_used: Annotated[list, merge_list]
    answer: str
    search_rows: list
    verify_error: str | None
    search_error: str | None


class AgentContext(TypedDict):
    """Deps tĩnh 1 run — model LLM + shared MCP + router.

    Nhập qua graph.ainvoke(state, context=...) — KHÔNG nằm trong state.
    """

    model: Any | None
    models: Any | None
    mcp: Any | None
    router: Any | None
