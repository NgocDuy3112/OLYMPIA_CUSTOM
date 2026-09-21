"""Opik tracing — open-source LLM observability (self-host).

Bật khi OPIK_URL_HOST có giá trị (vd http://opik:5173 trong compose).
Không có env → no-op, graph chạy bình thường không trace.
"""

from __future__ import annotations

import os
from typing import Any


def is_enabled() -> bool:
    return bool(os.environ.get("OPIK_URL_HOST", "").strip())


def track_graph(graph: Any, tags: list[str] | None = None) -> Any:
    """Wrap compiled graph bằng track_langgraph — trace mọi invoke."""
    if not is_enabled():
        return graph
    try:
        from opik.integrations.langchain import OpikTracer, track_langgraph

        tracer = OpikTracer(tags=tags or ["ocee"])
        return track_langgraph(graph, tracer)
    except ImportError:
        return graph


def track(name: str) -> Any:
    """Decorator @track cho tool/LLM calls. No-op khi Opik tắt/thiếu dep."""

    def decorator(fn: Any) -> Any:
        if not is_enabled():
            return fn
        try:
            import opik

            return opik.track(name=name)(fn)
        except ImportError:
            return fn

    return decorator
