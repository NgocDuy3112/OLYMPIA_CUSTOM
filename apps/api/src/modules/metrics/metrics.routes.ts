/**
 * metrics — Prometheus instrumentation for Fastify.
 *
 * Metrics (prefix oc_api_):
 *   http_requests_total{method,route,status}
 *   http_request_duration_seconds{method,route,status}
 *   ws_connections_current
 *   agent_ask_total{status} / agent_ask_errors_total
 *
 * Route: GET /metrics (no auth — Prometheus scrapes internal network).
 */

import type { FastifyInstance } from "fastify";
import {
    Counter,
    Gauge,
    Histogram,
    Registry,
    collectDefaultMetrics,
} from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry, prefix: "oc_api_" });

export const httpRequestsTotal = new Counter({
    name: "oc_api_http_requests_total",
    help: "Total HTTP requests",
    labelNames: ["method", "route", "status"],
    registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
    name: "oc_api_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status"],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [metricsRegistry],
});

export const wsConnectionsCurrent = new Gauge({
    name: "oc_api_ws_connections_current",
    help: "Current WebSocket connections",
    registers: [metricsRegistry],
});

export const agentAskTotal = new Counter({
    name: "oc_api_agent_ask_total",
    help: "Total agent_ask forwards (WS + HTTP)",
    labelNames: ["status"],
    registers: [metricsRegistry],
});

export function observeAgentAsk(status: "ok" | "rate_limited" | "error"): void {
    agentAskTotal.inc({ status });
}

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
    // Timing hook — skip /metrics itself to avoid self-scrape noise.
    app.addHook("onResponse", async (request, reply) => {
        const url = request.url.split("?")[0];
        if (url === "/metrics") return;
        const route = (request.routeOptions?.url ?? url).split("?")[0];
        const labels = {
            method: request.method,
            route,
            status: String(reply.statusCode),
        };
        httpRequestsTotal.inc(labels);
        const ms = reply.elapsedTime ?? 0;
        httpRequestDuration.observe(labels, ms / 1000);
    });

    app.get("/metrics", async (_request, reply) => {
        reply.header("Content-Type", metricsRegistry.contentType);
        return reply.send(await metricsRegistry.metrics());
    });
}
