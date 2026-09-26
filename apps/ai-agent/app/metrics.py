"""Prometheus metrics — prefix ocee_.

Metrics:
  ocee_ask_total{task,status} — asks theo task (qa/verify/index/assist/refuse)
  ocee_ask_duration_seconds{task} — latency ask
  ocee_tool_errors_total{tool} — tool lỗi
  ocee_llm_errors_total — LLM HTTP lỗi
  ocee_route_source{source} — jev | jev_low_conf | keyword
  ocee_route_confidence{task} — confidence Jev Choice mỗi ask
"""

from __future__ import annotations

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

ASK_TOTAL = Counter(
    "ocee_ask_total", "Total asks", ["task", "status"]
)
ASK_DURATION = Histogram(
    "ocee_ask_duration_seconds",
    "Ask latency in seconds",
    ["task"],
    buckets=(0.1, 0.5, 1, 2.5, 5, 10, 30),
)
TOOL_ERRORS = Counter(
    "ocee_tool_errors_total", "Tool errors", ["tool"]
)
LLM_ERRORS = Counter(
    "ocee_llm_errors_total", "LLM HTTP errors"
)
ROUTE_SRC = Counter(
    "ocee_route_source", "Router source per ask", ["source"]
)
ROUTE_CONF = Histogram(
    "ocee_route_confidence",
    "Jev route confidence",
    ["task"],
    buckets=(0.3, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0),
)


def metrics_bytes() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
