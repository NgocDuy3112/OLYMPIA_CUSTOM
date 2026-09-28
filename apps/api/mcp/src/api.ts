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

/** Chuẩn hoá output tool: strip PII, trả data gọn, giữ message khi lỗi logic. */
export function toToolText(payload: unknown): string {
  return JSON.stringify(stripPII(payload), null, 2).slice(0, 20000);
}

const PII_KEYS = new Set([
  "usercode",
  "user_code",
  "userid",
  "user_id",
  "playerid",
  "player_id",
  "username",
  "user_name",
  "nickname",
  "nick_name",
  "displayname",
  "display_name",
  "globalname",
  "email",
]);

/**
 * Strip định danh khỏi mọi output MCP (userCode/id, tên, email).
 * Agent trả kết quả cho controller tự thao tác — không cần biết ai là ai.
 * Ngoại lệ: verdictBy (Discord) giữ để biết ai bấm duyệt.
 * Sau này agent tự thao tác: thêm scope `identity` bypass strip theo token.
 */
export function stripPII<T>(value: T, keep: Set<string> = new Set(["verdictby"])): T {
  if (Array.isArray(value)) return value.map((v) => stripPII(v, keep)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const low = k.toLowerCase();
      if (!PII_KEYS.has(low) || keep.has(low)) out[k] = stripPII(v, keep);
    }
    return out as T;
  }
  return value;
}
