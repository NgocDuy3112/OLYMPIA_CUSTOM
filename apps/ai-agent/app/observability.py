from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

_SETUP_DONE = False


def is_enabled() -> bool:
    # Self-host Phoenix: trỏ endpoint (vd http://phoenix:6006). Trống = tắt.
    return bool(os.environ.get("PHOENIX_COLLECTOR_ENDPOINT", "").strip())


def setup(app=None) -> None:
    """Đăng ký OTel tracer → collector + auto-instrument LangChain/LangGraph.

    Idempotent — gọi 1 lần lúc app start. Không set env = no-op (tests/dev).
    `app` (FastAPI) truyền vào sẽ instrument server span — span đang mở lúc
    handler chạy cho traceID gắn vào exemplar metric.
    """
    global _SETUP_DONE
    if _SETUP_DONE or not is_enabled():
        return
    from phoenix.otel import register

    endpoint = os.environ["PHOENIX_COLLECTOR_ENDPOINT"].strip()
    try:
        register(
            endpoint=endpoint,
            project_name=os.environ.get("PHOENIX_PROJECT_NAME", "").strip() or "ocee",
            api_key=os.environ.get("PHOENIX_API_KEY", "").strip() or None,
            protocol="http/protobuf",
            auto_instrument=True,  # discover entry point langchain instrumentor
            verbose=False,
        )
    except AttributeError as exc:
        # Bug arize-phoenix-otel 0.17.1 × otel exporter 1.45: _tracing_details()
        # đọc exporter._headers (đã bỏ ở bản mới). Provider/processor +
        # auto-instrument đã set TRƯỚC dòng đó → export vẫn chạy bình thường.
        logger.warning("phoenix.otel.register lỗi chi tiết (vẫn hoạt động): %s", exc)
    if app is not None:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor().instrument_app(app, excluded_urls=".*/metrics,.*/health")
    _SETUP_DONE = True


def flush() -> None:
    """Force flush span trước khi process exit — best-effort, không chặn shutdown."""
    if not _SETUP_DONE:
        return
    try:
        from opentelemetry import trace

        trace.get_tracer_provider().force_flush()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Phoenix flush lỗi (trace cuối có thể mất): %s", exc)


def current_trace_id() -> str | None:
    """Trace id hex của span đang mở — gắn vào exemplar metric (nếu đã setup)."""
    if not _SETUP_DONE:
        return None
    try:
        from opentelemetry import trace

        ctx = trace.get_span_context()
        if not ctx.is_valid:
            return None
        return format(ctx.trace_id, "032x")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Đọc trace id lỗi: %s", exc)
        return None
