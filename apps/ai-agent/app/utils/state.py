from __future__ import annotations

from operator import add
from enum import Enum
from typing import Annotated, TypedDict

from langgraph.graph import MessagesState
from langgraph.graph.message import add_messages


class Task(str, Enum):
    VERIFY = "verify"
    ASSIST = "assist"
    REFUSE = "refuse"


class QuestionSubAgent(str, Enum):
    REASON = "reason_subagent"
    FACT = "fact_subgent"
    FRESH = "fresh_subagent"
    

class AgentInputState(MessagesState):
    pass


class AgentOutputState(MessagesState):
    response: str


class AgentState(AgentInputState, AgentOutputState):
    pass