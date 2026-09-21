"""Prometheus metrics — prefix ocee_.

Metrics:
  ocee_ask_total{task,status} — asks theo task (verify/update/place/index/qa)
  ocee_ask_duration_seconds{task} — latency ask
  ocee_reflect_rounds{task} — số vòng reflect (critique quay lại verify)
  ocee_tool_errors_total{tool} — tool lỗi
  ocee_llm_errors_total — LLM HTTP lỗi
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
REFLECT_ROUNDS = Histogram(
    "ocee_reflect_rounds",
    "Reflect rounds per ask",
    ["task"],
    buckets=(0, 1, 2, 3),
)
TOOL_ERRORS = Counter(
    "ocee_tool_errors_total", "Tool errors", ["tool"]
)
LLM_ERRORS = Counter(
    "ocee_llm_errors_total", "LLM HTTP errors"
)


def metrics_bytes() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
