import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../utils/errors.js";
import {
  COOKIE_NAME,
  getSession,
  reqSession,
  type SessionData,
} from "./session.js";

export function isStaffRole(role: string): boolean {
  return role === "admin" || role === "operator";
}

export function isOperatorLike(role?: string | null): boolean {
  return role === "operator" || role === "agent";
}

export function requireAuth(app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const sid = request.cookies?.[COOKIE_NAME];
    if (!sid) {
      throw new AppError(401, "Not authenticated");
    }
    const session = await getSession(app.valkey, sid);
    if (!session) {
      throw new AppError(401, "Session expired");
    }
    (request as any).session = session;
  };
}

export function requireRole(app: FastifyInstance, ...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(app)(request, reply);
    if (reply.sent) return;
    const session = reqSession(request) as SessionData;
    if (!roles.includes(session.role) && session.role !== "admin") {
      throw new AppError(403, `Role '${session.role}' is not allowed`);
    }
  };
}

export function requireScope(app: FastifyInstance, ...scopes: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await requireAuth(app)(request, reply);
    if (reply.sent) return;
    const session = reqSession(request) as SessionData;
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
    if (!isOperatorLike(session.role) || !ok) {
      throw new AppError(403, `Missing required scope: ${scopes.join(" or ")}`);
    }
  };
}
