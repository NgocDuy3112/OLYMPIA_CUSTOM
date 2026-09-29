import { AsyncLocalStorage } from "node:async_hooks";
import { getMcpEnv } from "./env.js";

/**
 * Identity (userCode) cho request hiện tại — sid mint server-side, client không thấy.
 * HTTP: per-request ALS (mỗi POST /mcp 1 identity).
 * stdio: static 1 identity cho cả process (stdin events không mang context ALS).
 */
const als = new AsyncLocalStorage<{ userCode: string }>();
let staticIdentity: string | null = null;

/** sid cache theo userCode. Server TTL 24h — khi API trả 401 → refresh + retry. */
const sidCache = new Map<string, string>();

export function runWithIdentity<T>(userCode: string | null, fn: () => T): T {
  return userCode ? als.run({ userCode }, fn) : fn();
}

export function setStaticIdentity(userCode: string | null): void {
  staticIdentity = userCode;
}

export function currentIdentity(): string | null {
  return als.getStore()?.userCode ?? staticIdentity;
}

/** Đổi userCode → sid qua backend. Guard: Bearer MCP_SERVICE_TOKEN + role operator/admin. */
async function mintSid(userCode: string): Promise<string> {
  const env = getMcpEnv();
  const res = await fetch(`${env.apiBaseUrl}/api/auth/service/session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.mcpServiceToken
        ? { Authorization: `Bearer ${env.mcpServiceToken}` }
        : {}),
    },
    body: JSON.stringify({ userCode }),
  });
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    message?: string;
    data?: { sid?: string };
  } | null;
  const sid = json?.data?.sid;
  if (!res.ok || json?.status !== "success" || !sid) {
    throw new Error(
      `Mint session lỗi (HTTP ${res.status}) cho ${userCode}: ${json?.message ?? "unknown"}`,
    );
  }
  return sid;
}

/** sid cho identity — cache hit hoặc mint mới. */
export async function getSid(userCode: string): Promise<string> {
  const cached = sidCache.get(userCode);
  if (cached) return cached;
  const sid = await mintSid(userCode);
  sidCache.set(userCode, sid);
  return sid;
}

/** API nói sid hết hạn (401) → quên cache, mint lại 1 lần. */
export async function refreshSid(userCode: string): Promise<string> {
  sidCache.delete(userCode);
  return getSid(userCode);
}
