from __future__ import annotations

from typing import Any

from app.utils.nodes import (
    agent_node,
    fact_node,
    fresh_node,
    reason_node,
    refuse_node,
    route_node,
    track_node,
)
from app.utils.state import AgentContext, AgentState

TASK_SUBAGENT: dict[str, str | None] = {
    "qa": "qa_agent",
    "verify": "track_router",
    "index": "bank_agent",
    "assist": "track_router",
    "ops": "ops_agent",
    "refuse": None,
}


def build_graph(checkpointer: Any | None = None) -> Any:
    """Dựng StateGraph OCee. checkpointer=None → chạy không persist (test)."""
    from langgraph.graph import END, START, StateGraph

    builder = StateGraph(AgentState, context_schema=AgentContext)
    builder.add_node("route", route_node)
    builder.add_node("track", track_node)
    builder.add_node("agent", agent_node)
    builder.add_node("reason_agent", reason_node)
    builder.add_node("fact_agent", fact_node)
    builder.add_node("fresh_agent", fresh_node)
    builder.add_node("refuse", refuse_node)

    builder.add_edge(START, "route")
    # Route tier-1 chọn task/subagent. verify/assist → track tier-2.
    builder.add_conditional_edges(
        "route",
        lambda s: (
            "track"
            if s.get("subagent") == "track_router"
            else ("agent" if s.get("subagent") else "refuse")
        ),
        {"track": "track", "agent": "agent", "refuse": "refuse"},
    )
    # Track tier-2 chọn subagent track, fail-open bank_agent chung.
    builder.add_conditional_edges(
        "track",
        lambda s: s.get("subagent") or "agent",
        {
            "reason_agent": "reason_agent",
            "fact_agent": "fact_agent",
            "fresh_agent": "fresh_agent",
            "bank_agent": "agent",
        },
    )
    builder.add_edge("agent", END)
    builder.add_edge("reason_agent", END)
    builder.add_edge("fact_agent", END)
    builder.add_edge("fresh_agent", END)
    builder.add_edge("refuse", END)

    if checkpointer is not None:
        return builder.compile(checkpointer=checkpointer)
    return builder.compile()
