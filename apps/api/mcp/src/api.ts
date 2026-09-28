import { getMcpEnv } from "./env.js";

export interface ApiCallOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Ghi đè sid mặc định từ env (http mode: lấy từ header). */
  sid?: string;
}

function buildUrl(path: string, query?: ApiCallOptions["query"]): string {
  const { apiBaseUrl } = getMcpEnv();
  const url = new URL(path, apiBaseUrl);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

/** Fetch wrapper tới Fastify backend, giữ nguyên envelope {status,message,data}. */
export async function apiFetch<T = unknown>(
  path: string,
  opts: ApiCallOptions = {},
): Promise<T> {
  const env = getMcpEnv();
  const sid = opts.sid ?? env.apiSid;
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? "GET",
    headers: {
      ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(sid ? { Cookie: `sid=${encodeURIComponent(sid)}` } : {}),
      ...(env.agentToken ? { "X-Agent-Token": env.agentToken } : {}),
      ...(env.botToken ? { "X-Bot-Token": env.botToken } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`API ${path} trả về non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const msg =
      (json as { message?: string } | null)?.message ?? `HTTP ${res.status}`;
    throw new Error(`API ${path} lỗi HTTP ${res.status}: ${msg}`);
  }
  return json as T;
}

/** Chuẩn hoá output tool: trả data gọn, giữ message khi lỗi logic. */
export function toToolText(payload: unknown): string {
  return JSON.stringify(payload, null, 2).slice(0, 20000);
}
