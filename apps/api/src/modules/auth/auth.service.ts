
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { argon2id, argon2Verify } from "hash-wasm";
import {
  drizzleUserRepo,
  type UserRepo,
  type UserRow,
} from "../user/user.repo.js";
import { getEnv } from "../../config/env.js";
import { AppError } from "../../utils/errors.js";
import { writeAudit } from "../audit/audit.service.js";
import {
  COOKIE_NAME,
  SESSION_TTL,
  createSession,
  createUserSession,
  deleteSession,
  getSession,
  touchSession,
} from "./session.js";
import {
  checkLoginRateLimit,
  clearFailedLogins,
  recordFailedLogin,
} from "./login-rate.js";

// Re-export the session, guard, and login-rate helpers from their new
// sibling modules so existing import paths keep working.
export type { SessionData } from "./session.js";
export {
  reqSession,
  createSession,
  getSession,
  deleteSession,
  touchSession,
} from "./session.js";
export {
  requireAuth,
  requireRole,
  requireScope,
  isStaffRole,
  isOperatorLike,
} from "./guards.js";
export {
  checkLoginRateLimit,
  recordFailedLogin,
  clearFailedLogins,
} from "./login-rate.js";

export function uuidOrNull(id: string | null | undefined): string | null {
  return id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}


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

export async function hashPassword(password: string): Promise<string> {
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
  data?: unknown,
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
  return reply.send({ status: "success", message: "OK", data: data ?? null });
}

export function serviceSession(
  app: FastifyInstance,
  repo: UserRepo = drizzleUserRepo,
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.headers.authorization ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const env = getEnv();
    if (!env.MCP_SERVICE_TOKEN || token !== env.MCP_SERVICE_TOKEN) {
      throw new AppError(403, "Service token invalid");
    }
    const body = (request.body ?? {}) as { userCode?: unknown };
    const userCode =
      typeof body.userCode === "string" ? body.userCode.trim() : "";
    if (!userCode) throw new AppError(400, "userCode is required");
    const user = await repo.findByCode(userCode);
    if (!user) throw new AppError(404, "User not found");
    if (user.role !== "operator" && user.role !== "admin") {
      throw new AppError(403, "Identity phải là operator hoặc admin");
    }
    const sid = await createUserSession(app, user);
    void writeAudit({
      actionType: "MCP_SESSION_MINT",
      actorCode: user.userCode,
      details: `role=${user.role}`,
    });
    return reply.send({
      status: "success",
      message: "OK",
      data: { sid, expiresIn: SESSION_TTL },
    });
  };
}


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

    const found = await repo.findByEmail(googleUser.email);
    let user: UserRow;

    if (found) {
      user = found;
      if (user.role === "admin" || user.role === "operator" || user.role === "agent") {
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
        ? "http://localhost:4173"
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
      throw new AppError(401, "Not authenticated");
    }
    const session = await getSession(app.valkey, sid);
    if (!session) {
      throw new AppError(401, "Session expired");
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
    if (user && (user.role === "admin" || user.role === "operator" || user.role === "agent")) {
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

export function staffLogin(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      username?: unknown;
      password?: unknown;
      expectRole?: unknown;
    };
    const rawUsername = typeof body.username === "string" ? body.username.trim() : "";
    if (rawUsername.includes("@")) {
      validateEmailPassword(rawUsername.toLowerCase(), body.password);
    } else {
      validateUsernamePassword(rawUsername, body.password);
    }
    const username = rawUsername.toLowerCase();
    const expectRole =
      body.expectRole === "admin" || body.expectRole === "operator"
        ? (body.expectRole as string)
        : null;
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip;
    const rateKey = `${ip}:staff:${username}`;

    await checkLoginRateLimit(app.valkey, rateKey);
    const deny = async (): Promise<never> => {
      await recordFailedLogin(app.valkey, rateKey);
      throw new AppError(401, "Invalid username or password");
    };

    const env = getEnv();
    const envAdmin = env.ADMIN_USERNAME.trim().toLowerCase();
    let cred = parseStaffCredentials().find((c) => c.username === username);
    let credRole: string | null = null;
    let credScopes = "";
    if (envAdmin && username === envAdmin && env.ADMIN_PASSWORD) {
      if (body.password !== env.ADMIN_PASSWORD) await deny();
      cred = cred ?? { username: envAdmin, hash: "", role: "admin", scopes: "" };
      credRole = "admin";
    } else if (cred) {
      if (!(await verifyPassword(body.password as string, cred.hash))) await deny();
      credRole = cred.role;
      credScopes = cred.scopes;
    }

    if (cred) {
      if (expectRole && credRole !== expectRole) {
        throw new AppError(403, expectRole === "admin"
              ? "Tài khoản operator — dùng trang đăng nhập operator"
              : "Tài khoản admin — dùng trang đăng nhập admin");
      }
      await clearFailedLogins(app.valkey, rateKey);
      void writeAudit({ actionType: "LOGIN", actorCode: cred.username.toUpperCase() });
      const sid = await createSession(app.valkey, {
        userId: `staff:${cred.username}`,
        userCode: cred.username.toUpperCase(),
        role: credRole ?? cred.role,
        email: "",
        userName: cred.username,
        createdAt: Date.now(),
        lastSeen: Date.now(),
      });
      await app.valkey.set(
        `staff:scopes:${sid}`,
        credScopes,
        "EX",
        SESSION_TTL,
      );
      return issueSessionCookie(reply, sid, undefined, {
        role: credRole ?? cred.role,
        operatorScopes: credScopes || null,
      });
    }

    const found = rawUsername.includes("@")
      ? await drizzleUserRepo.findByEmail(username)
      : await drizzleUserRepo.findByCode(rawUsername.toUpperCase());
    if (!found || found.isDeleted) await deny();
    const row = found as NonNullable<typeof found>;
    if (row.role !== "admin" && row.role !== "operator" && row.role !== "agent") {
      throw new AppError(403, "Tài khoản thí sinh/khán giả — dùng trang đăng nhập chính");
    }
    if (!row.passwordHash) await deny();
    if (!(await verifyPassword(body.password as string, row.passwordHash as string))) {
      await deny();
    }
    if (expectRole && row.role !== expectRole) {
      throw new AppError(403, expectRole === "admin"
            ? "Tài khoản operator — dùng trang đăng nhập operator"
            : "Tài khoản admin — dùng trang đăng nhập admin");
    }
    await clearFailedLogins(app.valkey, rateKey);
    void writeAudit({ actionType: "LOGIN", actorCode: row.userCode });
    const sid = await createUserSession(app, row);
    return issueSessionCookie(reply, sid, undefined, {
      role: row.role,
      operatorScopes: row.operatorScopes,
    });
  };
}

