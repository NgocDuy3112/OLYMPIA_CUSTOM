
import { getEnv } from "./config/env.js";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000/api";

let _sid: string | null = null;
let _loginInflight: Promise<string> | null = null;

function creds(): { username: string; password: string } {
  const env = getEnv();
  return { username: env.BOT_STAFF_USERNAME, password: env.BOT_STAFF_PASSWORD };
}

export async function loginBot(): Promise<string> {
  if (_loginInflight) return _loginInflight;
  _loginInflight = (async () => {
    const { username, password } = creds();
    if (!username || !password) {
      throw new Error("BOT_STAFF_USERNAME/PASSWORD chưa cấu hình");
    }
    const resp = await fetch(`${API_BASE}/auth/staff-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!resp.ok) {
      throw new Error(`Bot staff login failed (${resp.status})`);
    }
    const setCookie = resp.headers.get("set-cookie") ?? "";
    const sid = /sid=([^;]+)/.exec(setCookie)?.[1];
    if (!sid) throw new Error("Bot staff login: không thấy cookie sid");
    _sid = decodeURIComponent(sid);
    return _sid;
  })();
  try {
    return await _loginInflight;
  } finally {
    _loginInflight = null;
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (_sid) h["Cookie"] = `sid=${encodeURIComponent(_sid)}`;
  return h;
}

export async function botFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const doFetch = () =>
    fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { ...headers(), ...((init.headers as Record<string, string>) ?? {}) },
    });
  let resp = await doFetch();
  if (resp.status === 401) {
    await loginBot();
    resp = await doFetch();
  }
  return resp;
}
