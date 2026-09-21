/**
 * agent.routes — Gateway cho ai-agent (MVP 2).
 *
 * Client không nói chuyện trực tiếp với Python agent. Flow:
 *   WS `agent_ask` → xác thực session → rate limit → forward HTTP
 *   POST {AGENT_URL}/agent/ask (kèm X-User-Code / X-User-Role)
 *   → trả `agent_answer` về user qua WS.
 *
 * Note MVP: HTTP-only transport (dùng fetch giữ-alive); WS message type
 * `agent_ask` handle ở ws.handler — module này chỉ export handler dùng chung.
 */

import { getEnv } from "../../config/env.js";
import { observeAgentAsk } from "../metrics/metrics.routes.js";

const env = getEnv();
const AGENT_URL = env.AGENT_URL;
const AGENT_TIMEOUT_MS = 15_000;
const RATE_LIMIT_PER_MINUTE = 10;

export interface GatewayIdentity {
  userCode: string;
  role: "controller" | "mc" | "qauthor" | "operator" | "admin";
}

/**
 * Forward một câu hỏi tới ai-agent. Rate limit theo user, per minute.
 * valkey: ioredis instance (từ app.valkey).
 */
export async function forwardAgentAsk(
  valkey: {
    incr: (key: string) => Promise<number>;
    expire: (key: string, seconds: number) => Promise<unknown>;
  },
  identity: GatewayIdentity,
  matchCode: string,
  question: string,
): Promise<{ answer: string; tools_used: string[] }> {
  // Rate limit trước khi forward — fail closed.
  const rateKey = `agent:rate:${identity.userCode}:1m`;
  const count = await valkey.incr(rateKey);
  if (count === 1) {
    await valkey.expire(rateKey, 60);
  }
  if (count > RATE_LIMIT_PER_MINUTE) {
    observeAgentAsk("rate_limited");
    throw new AgentRateLimitError();
  }

  const response = await fetch(`${AGENT_URL}/agent/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Code": identity.userCode,
      "X-User-Role": identity.role,
    },
    body: JSON.stringify({ match_code: matchCode, question }),
    signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
  });

  if (response.status === 429) {
    observeAgentAsk("rate_limited");
    throw new AgentRateLimitError();
  }
  if (!response.ok) {
    observeAgentAsk("error");
    const detail = await response.text().catch("");
    throw new Error(`Agent error (${response.status}): ${detail.slice(0, 200)}`);
  }
  observeAgentAsk("ok");

  const data = (await response.json()) as {
    answer: string;
    tools_used?: string[];
  };
  return { answer: data.answer, tools_used: data.tools_used ?? [] };
}

export class AgentRateLimitError extends Error {
  constructor() {
    super("Agent rate limit exceeded");
    this.name = "AgentRateLimitError";
  }
}
