import { AsyncLocalStorage } from "node:async_hooks";
import { getMcpEnv } from "./env.js";

const als = new AsyncLocalStorage<{ userCode: string }>();
let staticIdentity: string | null = null;

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

export async function getSid(userCode: string): Promise<string> {
  const cached = sidCache.get(userCode);
  if (cached) return cached;
  const sid = await mintSid(userCode);
  sidCache.set(userCode, sid);
  return sid;
}

export async function refreshSid(userCode: string): Promise<string> {
  sidCache.delete(userCode);
  return getSid(userCode);
}
