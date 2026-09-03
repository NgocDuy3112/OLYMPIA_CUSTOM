/**
 * Auth service — Google OAuth + Valkey session management.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, users } from "@oc/db";
import { getEnv } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";

// ── Types ──

interface SessionData {
  userId: string;
  userCode: string;
  role: string;
  email: string;
  userName: string;
  matchCode?: string;
  createdAt: number;
  lastSeen: number;
}

// ── Session helpers ──

const SESSION_PREFIX = "session:";
const SESSION_TTL = 86400;
const COOKIE_NAME = "sid";

function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  valkey: any,
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
  valkey: any,
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

export async function deleteSession(valkey: any, sid: string): Promise<void> {
  await valkey.del(`${SESSION_PREFIX}${sid}`);
}

export async function touchSession(valkey: any, sid: string): Promise<void> {
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
    /* ignore */
  }
}

// ── Google OAuth ──

function getGoogleAuthUrl(): string {
  const env = getEnv();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeCode(code: string) {
  const env = getEnv();
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  if (!resp.ok)
    throw new AppError(401, "Failed to exchange Google authorization code");
  return resp.json() as Promise<{ access_token: string }>;
}

async function fetchGoogleUserInfo(accessToken: string) {
  const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) throw new AppError(401, "Failed to fetch Google user info");
  return resp.json() as Promise<{
    sub: string;
    email: string;
    name: string;
    picture?: string;
  }>;
}

// ── Route handlers (using closures to capture app.valkey) ──

export function googleRedirect(_request: FastifyRequest, reply: FastifyReply) {
  return reply.redirect(getGoogleAuthUrl());
}

export function googleCallback(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.query as { code?: string };
    if (!code) throw new AppError(400, "Missing authorization code");

    const tokens = await exchangeCode(code);
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);

    // Upsert user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, googleUser.email))
      .limit(1);
    let user: typeof users.$inferSelect;

    if (existing.length > 0) {
      user = existing[0];
      await db
        .update(users)
        .set({
          googleId: googleUser.sub,
          avatarUrl: googleUser.picture ?? user.avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } else {
      const userCode = `OC_U_${String(Date.now()).slice(-6)}`;
      const inserted = await db
        .insert(users)
        .values({
          googleId: googleUser.sub,
          email: googleUser.email,
          userCode,
          userName: googleUser.name,
          avatarUrl: googleUser.picture,
          role: "member",
        })
        .returning();
      user = inserted[0];
    }

    const sid = await createSession(app.valkey, {
      userId: user.id,
      userCode: user.userCode,
      role: user.role,
      email: user.email,
      userName: user.userName,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });

    const env = getEnv();
    const frontendUrl =
      env.CORS_ORIGINS === "*"
        ? "http://localhost:5173"
        : env.CORS_ORIGINS.split(",")[0].trim();

    return reply
      .setCookie(COOKIE_NAME, sid, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL,
      })
      .redirect(`${frontendUrl}/auth/callback?sid=${sid}`);
  };
}

export function getMe(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sid = request.cookies?.[COOKIE_NAME];
    if (!sid) {
      return reply
        .code(401)
        .send({ status: "error", message: "Not authenticated", data: null });
    }
    const session = await getSession(app.valkey, sid);
    if (!session) {
      return reply
        .code(401)
        .send({ status: "error", message: "Session expired", data: null });
    }
    await touchSession(app.valkey, sid);
    return reply.send({
      status: "success",
      message: "OK",
      data: {
        userId: session.userId,
        userCode: session.userCode,
        role: session.role,
        email: session.email,
        userName: session.userName,
      },
    });
  };
}

export function logout(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sid = request.cookies?.[COOKIE_NAME];
    if (sid) await deleteSession(app.valkey, sid);
    return reply
      .clearCookie(COOKIE_NAME, { path: "/" })
      .send({ status: "success", message: "Logged out", data: null });
  };
}

// ── Guards ──

export function requireAuth(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sid = request.cookies?.[COOKIE_NAME];
    if (!sid) {
      return reply
        .code(401)
        .send({ status: "error", message: "Not authenticated", data: null });
    }
    const session = await getSession(app.valkey, sid);
    if (!session) {
      return reply
        .code(401)
        .send({ status: "error", message: "Session expired", data: null });
    }
    (request as any).session = session;
  };
}

export function requireRole(app: FastifyInstance, ...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(app)(request, reply);
    if (reply.sent) return;
    const session = (request as any).session as SessionData;
    if (!roles.includes(session.role) && session.role !== "admin") {
      return reply.code(403).send({
        status: "error",
        message: `Role '${session.role}' is not allowed`,
        data: null,
      });
    }
  };
}
