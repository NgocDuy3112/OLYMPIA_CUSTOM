from __future__ import annotations

from typing import Annotated, Any, Literal

from typing_extensions import TypedDict

from app.domain.ports import (
    BankRepo,
    DiscordRepo,
    MatchStateRepo,
    QuestionRepo,
    ScoreRepo,
)

TaskKind = Literal["verify", "index", "qa", "ops", "assist", "refuse"]


def merge_list(left: list | None, right: list | None) -> list:
    return list(left or []) + list(right or [])


class AgentState(TypedDict, total=False):
    """Graph state — TypedDict; list field merge bằng reducer merge_list."""

    match_code: str
    question: str
    role: str
    user_code: str
    task: str
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
    """Deps tĩnh 1 run — contract Fastify repos + model LLM.

    Nhập qua graph.ainvoke(state, context=...) — KHÔNG nằm trong state.
    """

    snapshot_repo: MatchStateRepo
    score_repo: ScoreRepo
    question_repo: QuestionRepo
    bank_repo: BankRepo
    discord_repo: DiscordRepo
    model: Any | None
    router: Any | None
