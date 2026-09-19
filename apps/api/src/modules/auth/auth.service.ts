/**
 * Auth service — Google OAuth + Valkey session management.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";
import {
  drizzleUserRepo,
  type UserRepo,
  type UserRow,
} from "../user/user.repo.js";
import { getEnv } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { writeAudit } from "../audit/audit.service.js";

// ── Session constants ──

const SESSION_PREFIX = "session:";
const SESSION_TTL = 86400;
const COOKIE_NAME = "sid";

// ── Password hashing (argon2id, 32MB / t=3 / p=1) ──

const ARGON2_MEMORY_KIB = 32 * 1024;
const ARGON2_ITERATIONS = 3;
const ARGON2_PARALLELISM = 1;
const ARGON2_HASH_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 8;

function newSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return salt;
}

async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: newSalt(),
    parallelism: ARGON2_PARALLELISM,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    hashLength: ARGON2_HASH_LENGTH,
    outputType: "encoded",
  });
}

async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}

function validateEmailPassword(email: unknown, password: unknown): void {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AppError(400, "Invalid email");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

function validateUsernamePassword(username: unknown, password: unknown): void {
  if (typeof username !== "string" || !/^[a-z0-9_.-]{3,50}$/i.test(username)) {
    throw new AppError(400, "Invalid username");
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new AppError(
      400,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
}

// ── Seeded staff accounts (admin/operator via username+password) ──

interface StaffCredential {
  username: string;
  hash: string;
  role: string;
  scopes: string;
}

function parseStaffCredentials(): StaffCredential[] {
  const raw = getEnv().STAFF_CREDENTIALS.trim();
  if (!raw) return [];
  return raw
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [username, hash, role, scopes] = entry.split(":");
      if (!username || !hash || !role) return null;
      return {
        username: username.toLowerCase(),
        hash,
        role,
        scopes: scopes ?? "",
      };
    })
    .filter((c): c is StaffCredential => c !== null);
}

function issueSessionCookie(
  reply: FastifyReply,
  sid: string,
  redirectUrl?: string,
) {
  const env = getEnv();
  reply.setCookie(COOKIE_NAME, sid, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
  if (redirectUrl) return reply.redirect(redirectUrl);
  return reply.send({ status: "success", message: "OK", data: null });
}

async function createUserSession(
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

// ── Login rate-limit (Valkey, per IP+email) ──

const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_BLOCK_SEC = 15 * 60;

function loginAttemptKey(id: string): string {
  return `login:attempts:${id}`;
}

function loginBlockKey(id: string): string {
  return `login:block:${id}`;
}

async function checkLoginRateLimit(
  valkey: any,
  id: string,
): Promise<void> {
  if (!valkey) return;
  const blocked = await valkey.get(loginBlockKey(id));
  if (blocked) {
    throw new AppError(429, "Too many login attempts, try again later");
  }
}

async function recordFailedLogin(valkey: any, id: string): Promise<void> {
  if (!valkey) return;
  const key = loginAttemptKey(id);
  const count = await valkey.incr(key);
  if (count === 1) await valkey.expire(key, LOGIN_WINDOW_SEC);
  if (count >= LOGIN_MAX_ATTEMPTS) {
    await valkey.set(loginBlockKey(id), "1", "EX", LOGIN_BLOCK_SEC);
    await valkey.del(key);
  }
}

async function clearFailedLogins(valkey: any, id: string): Promise<void> {
  if (!valkey) return;
  await valkey.del(loginAttemptKey(id));
}

// ── Types ──

interface SessionData {
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

// ── Session helpers ──

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

export function googleCallback(
  app: FastifyInstance,
  repo: UserRepo = drizzleUserRepo,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.query as { code?: string };
    if (!code) throw new AppError(400, "Missing authorization code");

    const tokens = await exchangeCode(code);
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);

    // Upsert user via UserRepo (shared with modules/user)
    const found = await repo.findByEmail(googleUser.email);
    let user: UserRow;

    if (found) {
      user = found;
      // Staff accounts (admin/operator) must use username login only
      if (user.role === "admin" || user.role === "operator") {
        throw new AppError(
          403,
          "Staff accounts must log in via username, not Google",
        );
      }
      const avatarUrl = googleUser.picture ?? user.avatarUrl;
      await repo.updateGoogleInfo(user.id, {
        googleId: googleUser.sub,
        avatarUrl,
      });
      user = { ...user, googleId: googleUser.sub, avatarUrl };
    } else {
      const userCode = `OC_U_${String(Date.now()).slice(-6)}`;
      user = await repo.create({
        googleId: googleUser.sub,
        email: googleUser.email,
        userCode,
        userName: googleUser.name,
        avatarUrl: googleUser.picture,
        role: "player",
      });
    }

    const sid = await createSession(app.valkey, {
      userId: user.id,
      userCode: user.userCode,
      role: user.role,
      operatorScopes: user.operatorScopes ?? null,
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

export function getMe(app: FastifyInstance) {  return async (request: FastifyRequest, reply: FastifyReply) => {
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
    let operatorScopes = session.operatorScopes ?? null;
    if (!operatorScopes && session.userId.startsWith("staff:")) {
      const raw = await app.valkey.get(`staff:scopes:${sid}`);
      if (raw) operatorScopes = raw;
    }
    return reply.send({
      status: "success",
      message: "OK",
      data: {
        userId: session.userId,
        userCode: session.userCode,
        role: session.role,
        operatorScopes,
        email: session.email,
        userName: session.userName,
      },
    });
  };
}

export function logout(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sid = request.cookies?.[COOKIE_NAME];
    if (sid) {
      const session = await getSession(app.valkey, sid);
      if (session) {
        void writeAudit({ actionType: "LOGOUT", actorCode: session.userCode });
      }
      await deleteSession(app.valkey, sid);
    }
    return reply
      .clearCookie(COOKIE_NAME, { path: "/" })
      .send({ status: "success", message: "Logged out", data: null });
  };
}

// ── Email/password signup + login ──

export function signup(
  app: FastifyInstance,
  repo: UserRepo = drizzleUserRepo,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      email?: unknown;
      password?: unknown;
      userName?: unknown;
      role?: unknown;
    };
    validateEmailPassword(body.email, body.password);
    const email = (body.email as string).trim().toLowerCase();
    const userName =
      typeof body.userName === "string" && body.userName.trim()
        ? body.userName.trim().slice(0, 100)
        : email.split("@")[0];

    // Lock signup: only player/spectator allowed. Admin grants operator later.
    const requestedRole =
      typeof body.role === "string" ? body.role : "player";
    const role = requestedRole === "spectator" ? "spectator" : "player";

    const existing = await repo.findByEmail(email);
    if (existing) {
      throw new AppError(409, "Email already registered");
    }

    const passwordHash = await hashPassword(body.password as string);
    const userCode = `OC_U_${String(Date.now()).slice(-6)}`;
    const created = await repo.create({
      email,
      userCode,
      userName,
      passwordHash,
      role,
    });
    const sid = await createUserSession(app, created);
    return issueSessionCookie(reply, sid);
  };
}

export function login(
  app: FastifyInstance,
  repo: UserRepo = drizzleUserRepo,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { email?: unknown; password?: unknown };
    validateEmailPassword(body.email, body.password);
    const email = (body.email as string).trim().toLowerCase();
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip;
    const rateKey = `${ip}:${email}`;

    await checkLoginRateLimit(app.valkey, rateKey);

    const user = await repo.findByEmail(email);
    // Staff accounts (admin/operator) use username login only — block email login
    if (user && (user.role === "admin" || user.role === "operator")) {
      await recordFailedLogin(app.valkey, rateKey);
      throw new AppError(401, "Invalid email or password");
    }
    const ok =
      user?.passwordHash &&
      (await verifyPassword(body.password as string, user.passwordHash));
    if (!user || !ok) {
      await recordFailedLogin(app.valkey, rateKey);
      throw new AppError(401, "Invalid email or password");
    }

    await clearFailedLogins(app.valkey, rateKey);
    const sid = await createUserSession(app, user);
    void writeAudit({ actionType: "LOGIN", actorCode: user.userCode });
    return issueSessionCookie(reply, sid);
  };
}

// POST /auth/staff-login — username+password for pre-seeded admin/operator
export function staffLogin(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { username?: unknown; password?: unknown };
    validateUsernamePassword(body.username, body.password);
    const username = (body.username as string).trim().toLowerCase();
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip;
    const rateKey = `${ip}:staff:${username}`;

    await checkLoginRateLimit(app.valkey, rateKey);

    const cred = parseStaffCredentials().find((c) => c.username === username);
    const ok =
      cred && (await verifyPassword(body.password as string, cred.hash));
    if (!cred || !ok) {
      await recordFailedLogin(app.valkey, rateKey);
      throw new AppError(401, "Invalid username or password");
    }

    await clearFailedLogins(app.valkey, rateKey);
    void writeAudit({ actionType: "LOGIN", actorCode: cred.username.toUpperCase() });
    const sid = await createSession(app.valkey, {
      userId: `staff:${cred.username}`,
      userCode: cred.username.toUpperCase(),
      role: cred.role,
      email: "",
      userName: cred.username,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    });
    // Stash scopes in session via operatorScopes lookup at guard time
    await app.valkey.set(
      `staff:scopes:${sid}`,
      cred.scopes,
      "EX",
      SESSION_TTL,
    );
    return issueSessionCookie(reply, sid);
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

// requireScope — operator must hold a specific scope (controller/mc/qauthor).
// Admin bypasses. Reads scopes from session, falls back to staff:scopes Valkey key.
export function requireScope(app: FastifyInstance, ...scopes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(app)(request, reply);
    if (reply.sent) return;
    const session = (request as any).session as SessionData;
    if (session.role === "admin") return;
    let scopeList: string[] = [];
    if (session.operatorScopes) {
      scopeList = session.operatorScopes.split(",").map((s) => s.trim());
    } else if (session.userId.startsWith("staff:")) {
      const sid = request.cookies?.[COOKIE_NAME];
      if (sid && app.valkey) {
        const raw = await app.valkey.get(`staff:scopes:${sid}`);
        if (raw) scopeList = raw.split(",").map((s: string) => s.trim());
      }
    }
    const ok = scopes.some((s) => scopeList.includes(s));
    if (session.role !== "operator" || !ok) {
      return reply.code(403).send({
        status: "error",
        message: `Missing required scope: ${scopes.join(" or ")}`,
        data: null,
      });
    }
  };
}
