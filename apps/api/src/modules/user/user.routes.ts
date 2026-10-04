import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import {
  drizzleUserRepo,
  type UserRepo,
  type UserRow,
} from "./user.repo.js";
import { requireAuth, requireRole, hashPassword, reqSession } from "../auth/auth.service.js";

function toPublicProfile(row: UserRow) {
  return {
    userCode: row.userCode,
    userName: row.userName,
    role: row.role,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
  };
}

function toAdminView(row: UserRow) {
  return {
    id: row.id,
    userCode: row.userCode,
    userName: row.userName,
    email: row.email,
    role: row.role,
    operatorScopes: row.operatorScopes,
    avatarUrl: row.avatarUrl,
  };
}

export async function userRoutes(
  app: FastifyInstance,
  opts: { repo?: UserRepo } = {},
) {
  const repo = opts.repo ?? drizzleUserRepo;
  app.get(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request) as { userId: string };
      const row = await repo.findById(session.userId);
      if (!row) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: { ...toAdminView(row), createdAt: row.createdAt },
      });
    },
  );

  app.patch(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = reqSession(request) as { userId: string };
      const body = request.body as { userName?: unknown; avatarUrl?: unknown };
      const updates: { userName?: string; avatarUrl?: string | null } = {};
      if (typeof body.userName === "string" && body.userName.trim()) {
        updates.userName = body.userName.trim().slice(0, 100);
      }
      if (body.avatarUrl === null) {
        updates.avatarUrl = null;
      } else if (typeof body.avatarUrl === "string" && body.avatarUrl.trim()) {
        updates.avatarUrl = body.avatarUrl.trim().slice(0, 500);
      }
      if (Object.keys(updates).length === 0) {
        throw new AppError(400, "Nothing to update");
      }
      const result = await repo.updateById(session.userId, updates);
      if (!result) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "Profile updated",
        data: null,
      });
    },
  );

  app.get("/users/by-code/:userCode", async (request, reply) => {
    const { userCode } = request.params as { userCode: string };
    const row = await repo.findByCode(userCode);
    if (!row) {
      throw new AppError(404, "User not found");
    }
    return reply.send({
      status: "success",
      message: "OK",
      data: toPublicProfile(row),
    });
  });
  app.get(
    "/users",
    { preHandler: [requireRole(app, "admin")] },
    async (_request, reply) => {
      const rows = await repo.list();
      return reply.send({
        status: "success",
        message: "OK",
        data: rows.map((r) => ({
          ...toAdminView(r),
          isDeleted: r.isDeleted,
          createdAt: r.createdAt,
        })),
      });
    },
  );

  app.get(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const row = await repo.findByCode(userCode);
      if (!row) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: toAdminView(row),
      });
    },
  );

  app.post(
    "/users",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const body = request.body as {
        userName?: unknown;
        email?: unknown;
        password?: unknown;
        role?: unknown;
        scopes?: unknown;
      };
      const userName =
        typeof body.userName === "string" ? body.userName.trim() : "";
      const email = typeof body.email === "string" ? body.email.trim() : "";
      const password =
        typeof body.password === "string" ? body.password : "";
      const role = typeof body.role === "string" ? body.role : "player";
      const allowed = ["admin", "operator", "agent", "player", "spectator"];
      if (!userName) {
        throw new AppError(400, "userName required");
      }
      if (password.length < 8) {
        throw new AppError(400, "password must be at least 8 characters");
      }
      if (!allowed.includes(role)) {
        throw new AppError(400, `Invalid role. Must be one of: ${allowed.join(", ")}`);
      }
      const validScopes = ["qauthor", "controller", "mc"];
      const scopes =
        (role === "operator" || role === "agent") && Array.isArray(body.scopes)
          ? body.scopes.filter(
              (s): s is string =>
                typeof s === "string" && validScopes.includes(s),
            )
          : [];
      if ((role === "operator" || role === "agent") && scopes.length === 0) {
        throw new AppError(400, `${role} cần ít nhất 1 scope: ${validScopes.join(", ")}`);
      }
      const existing = email ? await repo.findByEmail(email) : null;
      if (existing) {
        throw new AppError(409, "Email đã tồn tại");
      }
      try {
        const userCode = `OC_U_${String(Date.now()).slice(-6)}`;
        const passwordHash = await hashPassword(password);
        const created = await repo.create({
          email: email || `${userCode.toLowerCase()}@olympia.local`,
          userCode,
          userName: userName.slice(0, 100),
          role: role as UserRow["role"],
          operatorScopes: scopes.length > 0 ? scopes.join(",") : null,
          passwordHash,
        });
        return reply.code(201).send({
          status: "success",
          message: "User created",
          data: toAdminView(created),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Create failed";
        throw new AppError(/unique|duplicate/i.test(msg) ? 409 : 400, msg);
      }
    },
  );

  app.put(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const body = request.body as { userName?: string; email?: string; password?: string; role?: string };
      const updates: {
        userName?: string;
        email?: string;
        passwordHash?: string;
        role?: UserRow["role"];
        operatorScopes?: string | null;
      } = {};
      if (body.userName) updates.userName = body.userName;
      if (typeof body.password === "string" && body.password) {
        if (body.password.length < 8) {
          throw new AppError(400, "password must be at least 8 characters");
        }
        updates.passwordHash = await hashPassword(body.password);
      }
      if (typeof body.email === "string" && body.email.trim()) {
        const email = body.email.trim().toLowerCase();
        const taken = await repo.findByEmail(email);
        if (taken && taken.userCode !== userCode) {
          throw new AppError(409, "Email đã tồn tại");
        }
        updates.email = email;
      }
      if (body.role) {
        const allowed = ["admin", "operator", "agent", "player", "spectator"];
        if (!allowed.includes(body.role)) {
          throw new AppError(400, `Invalid role. Must be one of: ${allowed.join(", ")}`);
        }
        updates.role = body.role as UserRow["role"];
        if (body.role !== "operator" && body.role !== "agent") {
          updates.operatorScopes = null;
        }
      }
      const result = await repo.updateByCode(userCode, updates);
      if (!result) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "User updated",
        data: { id: result.id },
      });
    },
  );

  app.put(
    "/users/:userCode/operator",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const body = request.body as { scopes?: unknown };
      const validScopes = ["qauthor", "controller", "mc"];
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.filter(
            (s): s is string => typeof s === "string" && validScopes.includes(s),
          )
        : [];
      if (scopes.length === 0) {
        throw new AppError(400, `scopes must be a non-empty array of: ${validScopes.join(", ")}`);
      }
      const result = await repo.grantOperator(userCode, scopes);
      if (!result) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "Operator scopes granted",
        data: { scopes: result.scopes },
      });
    },
  );

  app.delete(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const result = await repo.softDeleteByCode(userCode);
      if (!result) {
        throw new AppError(404, "User not found");
      }
      return reply.send({
        status: "success",
        message: "User deleted",
        data: null,
      });
    },
  );
}
