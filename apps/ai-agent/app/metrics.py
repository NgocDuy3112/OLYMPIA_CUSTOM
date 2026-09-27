from __future__ import annotations

from prometheus_client import REGISTRY, Counter, Histogram
from prometheus_client.openmetrics import exposition as openmetrics

OM_CONTENT_TYPE = "application/openmetrics-text; version=0.0.1; charset=utf-8"

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
    # OpenMetrics 0.0.1 — format duy nhất mang exemplar (traceID) ra ngoài.
    return openmetrics.generate_latest(REGISTRY, version="0.0.1"), OM_CONTENT_TYPE
