from __future__ import annotations

from enum import Enum
from typing import Annotated, Any

from typing_extensions import TypedDict


class TaskKind(str, Enum):
    VERIFY = "verify"
    INDEX = "index"
    QA = "qa"
    OPS = "ops"
    ASSIST = "assist"
    REFUSE = "refuse"


class QuestionDomainKind(str, Enum):
    REASON = "reason"
    FACT = "fact"
    FRESH = "fresh"


def merge_list(left: list | None, right: list | None) -> list:
    return list(left or []) + list(right or [])


class AgentState(TypedDict, total=False):
    task: TaskKind | str
    track: QuestionDomainKind | str
    subagent: str | None
    messages: Annotated[list, merge_list]
    tools_used: Annotated[list, merge_list]
    response: str


class AgentInput(TypedDict, total=False):
    tools_used: list


class AgentOutput(TypedDict, total=False):
    task: TaskKind | str
    track: QuestionDomainKind | str
    response: str
    tools_used: list


# ── Contract I/O từng node — thêm field sau này sửa 1 chỗ, không sờ state chung.
class RouteIn(TypedDict, total=False):
    question: str
    role: str


class RouteOut(TypedDict, total=False):
    task: TaskKind | str
    subagent: str | None
    tools_used: list


class TrackIn(TypedDict, total=False):
    question: str


class TrackOut(TypedDict, total=False):
    track: QuestionDomainKind | str
    subagent: str | None
    tools_used: list


class AgentIn(TypedDict, total=False):
    question: str
    task: str


class AgentOut(TypedDict, total=False):
    messages: list
    tools_used: list
    response: str


class RefuseOut(TypedDict, total=False):
    response: str


class AgentContext(TypedDict):
    question: str
    role: str
    models: Any | None
    mcp: Any | None
    router: Any | None
