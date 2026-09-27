from __future__ import annotations

from typing import Any

from app.utils.nodes import agent_node, refuse_node, route_node
from app.utils.state import AgentContext, AgentState

TASK_SUBAGENT: dict[str, str | None] = {
    "qa": "qa_agent",
    "verify": "bank_agent",
    "index": "bank_agent",
    "assist": "bank_agent",
    "ops": "ops_agent",
    "refuse": None,
}


def build_graph(checkpointer: Any | None = None) -> Any:
    """Dựng StateGraph OCee. checkpointer=None → chạy không persist (test)."""
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(AgentState, context_schema=AgentContext)
    builder.add_node("route", route_node)
    builder.add_node("agent", agent_node)
    builder.add_node("refuse", refuse_node)

    builder.add_edge(START, "route")
    # Route node chọn task/subagent (Jev → keyword). Không None → create_agent.
    builder.add_conditional_edges(
        "route",
        lambda s: "agent" if s.get("subagent") else "refuse",
        {"agent": "agent", "refuse": "refuse"},
    )
    builder.add_edge("agent", END)
    builder.add_edge("refuse", END)

    if checkpointer is not None:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()



