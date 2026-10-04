import type { FastifyInstance, FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import type Redis from "ioredis";
import type { UserRow } from "../user/user.repo.js";

const SESSION_PREFIX = "session:";
export const SESSION_TTL = 86400;
export const COOKIE_NAME = "sid";

export interface SessionData {
  userId: string;
  userCode: string;
  role: string;
  operatorScopes?: string | null;
  email: string;
  userName: string;
  matchCode?: string;
  createdAt: number;
  lastSeen: number;
}

export function reqSession(request: FastifyRequest): SessionData {
  return (request as unknown as { session?: SessionData })
    .session as SessionData;
}

function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  valkey: Redis,
  data: SessionData,
): Promise<string> {
  const sid = generateSessionId();
  await valkey.set(
    `${SESSION_PREFIX}${sid}`,
    JSON.stringify(data),
    "EX",
    SESSION_TTL,
  );
  return sid;
}

export async function getSession(
  valkey: Redis,
  sid: string,
): Promise<SessionData | null> {
  const raw = await valkey.get(`${SESSION_PREFIX}${sid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteSession(valkey: Redis, sid: string): Promise<void> {
  await valkey.del(`${SESSION_PREFIX}${sid}`);
}

export async function touchSession(valkey: Redis, sid: string): Promise<void> {
  const raw = await valkey.get(`${SESSION_PREFIX}${sid}`);
  if (!raw) return;
  try {
    const data = JSON.parse(raw) as SessionData;
    data.lastSeen = Date.now();
    await valkey.set(
      `${SESSION_PREFIX}${sid}`,
      JSON.stringify(data),
      "EX",
      SESSION_TTL,
    );
  } catch {
  }
}

export async function createUserSession(
  app: FastifyInstance,
  user: UserRow,
): Promise<string> {
  return createSession(app.valkey, {
    userId: user.id,
    userCode: user.userCode,
    role: user.role,
    operatorScopes: user.operatorScopes,
    email: user.email,
    userName: user.userName,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  });
}
