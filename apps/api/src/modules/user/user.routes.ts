import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, users } from "@oc/db";
import { requireAuth, requireRole } from "../auth/auth.service.js";

export async function userRoutes(app: FastifyInstance) {
  // GET /users/me — current user profile (private)
  app.get(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
      const rows = await db
        .select({
          id: users.id,
          userCode: users.userCode,
          userName: users.userName,
          email: users.email,
          role: users.role,
          operatorScopes: users.operatorScopes,
          avatarUrl: users.avatarUrl,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.id, session.userId), eq(users.isDeleted, false)))
        .limit(1);
      if (rows.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({ status: "success", message: "OK", data: rows[0] });
    },
  );

  // PATCH /users/me — update own userName/avatarUrl
  app.patch(
    "/users/me",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const session = (request as any).session as { userId: string };
      const body = request.body as { userName?: unknown; avatarUrl?: unknown };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (typeof body.userName === "string" && body.userName.trim()) {
        updates.userName = body.userName.trim().slice(0, 100);
      }
      if (body.avatarUrl === null) {
        updates.avatarUrl = null;
      } else if (typeof body.avatarUrl === "string" && body.avatarUrl.trim()) {
        updates.avatarUrl = body.avatarUrl.trim().slice(0, 500);
      }
      if (Object.keys(updates).length <= 1) {
        return reply
          .code(400)
          .send({ status: "error", message: "Nothing to update", data: null });
      }
      const result = await db
        .update(users)
        .set(updates)
        .where(and(eq(users.id, session.userId), eq(users.isDeleted, false)))
        .returning({ id: users.id });
      if (result.length === 0) {
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
    const rows = await db
      .select({
        userCode: users.userCode,
        userName: users.userName,
        role: users.role,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .limit(1);
    if (rows.length === 0) {
      return reply
        .code(404)
        .send({ status: "error", message: "User not found", data: null });
    }
    return reply.send({ status: "success", message: "OK", data: rows[0] });
  });
  app.get(
    "/users",
    { preHandler: [requireRole(app, "admin")] },
    async (_request, reply) => {
      const rows = await db
        .select({
          id: users.id,
          userCode: users.userCode,
          userName: users.userName,
          email: users.email,
          role: users.role,
          operatorScopes: users.operatorScopes,
          avatarUrl: users.avatarUrl,
          isDeleted: users.isDeleted,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.isDeleted, false));
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  app.get(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const rows = await db
        .select({
          id: users.id,
          userCode: users.userCode,
          userName: users.userName,
          email: users.email,
          role: users.role,
          operatorScopes: users.operatorScopes,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
        .limit(1);
      if (rows.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({ status: "success", message: "OK", data: rows[0] });
    },
  );

  app.put(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const body = request.body as { userName?: string; role?: string };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
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
        updates.role = body.role;
        // Clear scopes when leaving operator role
        if (body.role !== "operator") updates.operatorScopes = null;
      }
      const result = await db
        .update(users)
        .set(updates)
        .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
        .returning({ id: users.id });
      if (result.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "User updated",
        data: { id: result[0].id },
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
      const validScopes = ["question_creator", "controller", "mc", "referee"];
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
      const unique = [...new Set(scopes)].sort();
      const result = await db
        .update(users)
        .set({
          role: "operator",
          operatorScopes: unique.join(","),
          updatedAt: new Date(),
        })
        .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
        .returning({ id: users.id });
      if (result.length === 0) {
        return reply
          .code(404)
          .send({ status: "error", message: "User not found", data: null });
      }
      return reply.send({
        status: "success",
        message: "Operator scopes granted",
        data: { scopes: unique },
      });
    },
  );

  app.delete(
    "/users/:userCode",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const { userCode } = request.params as { userCode: string };
      const result = await db
        .update(users)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
        .returning({ id: users.id });
      if (result.length === 0) {
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
