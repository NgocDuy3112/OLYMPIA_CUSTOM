"""Test contract module còn sống của ai-agent (app/utils/).

Kiến trúc mới (reconstruct) chưa hoàn tất — app/agent.py còn import node cũ
(không tồn tại) và app/main.py đang rỗng, nên graph/routing CHƯA test được.
Khi2 file đó xong → thêm test tại đây.
"""

from __future__ import annotations

import json

from app.utils.state import (
    AgentInputState,
    AgentOutputState,
    AgentState,
    QuestionSubAgent,
    Task,
)
from app.utils.tools import tool_result_message


def test_task_enum_routing_kinds():
    assert {t.value for t in Task} == {"verify", "assist", "refuse"}


def test_question_subagent_members():
    assert {q.name for q in QuestionSubAgent} == {"REASON", "FACT", "FRESH"}


def test_state_layers():
    # TypedDict không xài issubclass — assert contract qua key annotations.
    assert set(AgentInputState.__annotations__) == {"messages"}
    assert set(AgentOutputState.__annotations__) == {"messages", "response"}
    assert set(AgentState.__annotations__) == {"messages", "response"}


def test_tool_result_message_shape():
    out = tool_result_message("bank_search", {"hits": 2})
    assert out["role"] == "tool"
    assert out["name"] == "bank_search"
    assert json.loads(out["content"]) == {"hits": 2}


def test_tool_result_message_unicode_passthrough():
    out = tool_result_message("q", "Sài Gòn")
    assert "Sài Gòn" in out["content"]


def test_tool_result_message_circular_falls_back():
    cycle: list = []
    cycle.append(cycle)
    out = tool_result_message("t", cycle)
    assert out["role"] == "tool"
    assert isinstance(out["content"], str)


def test_nodes_module_exposes_task_route():
    import app.utils.nodes as nodes

    assert hasattr(nodes, "task_route")
    assert callable(nodes.task_route)
