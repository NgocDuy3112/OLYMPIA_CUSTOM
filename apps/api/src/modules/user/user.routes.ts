import type { FastifyInstance } from "fastify";
import {
  drizzleUserRepo,
  type UserRepo,
  type UserRow,
} from "./user.repo.js";
import { requireAuth, requireRole, hashPassword } from "../auth/auth.service.js";

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
  // GET /users/me — current user profile (private)
  app.get(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
      const row = await repo.findById(session.userId);
      if (!row) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: { ...toAdminView(row), createdAt: row.createdAt },
      });
    },
  );

  // PATCH /users/me — update own userName/avatarUrl
  app.patch(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
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
        return reply
          .code(400)
          .send({ status: "error", message: "Nothing to update", data: null });
      }
      const result = await repo.updateById(session.userId, updates);
      if (!result) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "Profile updated",
        data: null,
      });
    },
  );

  // GET /users/by-code/:userCode — public profile (no email)
  app.get("/users/by-code/:userCode", async (request, reply) => {
    const { userCode } = request.params as { userCode: string };
    const row = await repo.findByCode(userCode);
    if (!row) {
      return reply
        .code(404)
        .send({ status: "error", message: "User not found", data: null });
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
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: toAdminView(row),
      });
    },
  );

  // POST /users — admin tạo user mới kèm role (+ scopes nếu operator).
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
      const allowed = ["admin", "operator", "player", "spectator"];
      if (!userName || !email) {
        return reply.code(400).send({
          status: "error",
          message: "userName and email required",
          data: null,
        });
      }
      if (password.length < 8) {
        return reply.code(400).send({
          status: "error",
          message: "password must be at least 8 characters",
          data: null,
        });
      }
      if (!allowed.includes(role)) {
        return reply.code(400).send({
          status: "error",
          message: `Invalid role. Must be one of: ${allowed.join(", ")}`,
          data: null,
        });
      }
      const validScopes = ["qauthor", "controller", "mc"];
      const scopes =
        role === "operator" && Array.isArray(body.scopes)
          ? body.scopes.filter(
              (s): s is string =>
                typeof s === "string" && validScopes.includes(s),
            )
          : [];
      if (role === "operator" && scopes.length === 0) {
        return reply.code(400).send({
          status: "error",
          message: `operator cần ít nhất 1 scope: ${validScopes.join(", ")}`,
          data: null,
        });
      }
      const existing = await repo.findByEmail(email);
      if (existing) {
        return reply.code(409).send({
          status: "error",
          message: "Email đã tồn tại",
          data: null,
        });
      }
      try {
        const userCode = `OC_U_${String(Date.now()).slice(-6)}`;
        const passwordHash = await hashPassword(password);
        const created = await repo.create({
          email,
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
        return reply
          .code(/unique|duplicate/i.test(msg) ? 409 : 400)
          .send({ status: "error", message: msg, data: null });
      }
    },
  );

  app.put(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const body = request.body as { userName?: string; role?: string };
      const updates: {
        userName?: string;
        role?: UserRow["role"];
        operatorScopes?: string | null;
      } = {};
      if (body.userName) updates.userName = body.userName;
      if (body.role) {
        const allowed = ["admin", "operator", "player", "spectator"];
        if (!allowed.includes(body.role)) {
          return reply.code(400).send({
            status: "error",
            message: `Invalid role. Must be one of: ${allowed.join(", ")}`,
            data: null,
          });
        }
        updates.role = body.role as UserRow["role"];
        // Clear scopes when leaving operator role
        if (body.role !== "operator") updates.operatorScopes = null;
      }
      const result = await repo.updateByCode(userCode, updates);
      if (!result) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "User updated",
        data: { id: result.id },
      });
    },
  );

  // PUT /users/:userCode/operator — admin grants/revokes operator scopes
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
        return reply.code(400).send({
          status: "error",
          message: `scopes must be a non-empty array of: ${validScopes.join(", ")}`,
          data: null,
        });
      }
      const result = await repo.grantOperator(userCode, scopes);
      if (!result) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
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
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "User deleted",
        data: null,
      });
    },
  );
}
