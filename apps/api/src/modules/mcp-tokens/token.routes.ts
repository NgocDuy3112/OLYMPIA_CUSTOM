import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/auth.service.js";
import { AppError } from "../../utils/errors.js";
import { drizzleUserRepo, type UserRepo } from "../user/user.repo.js";
import {
  newToken,
  readTokenFile,
  writeTokenFile,
  type McpTokenEntry,
} from "./token-store.js";


const ROLE_RANK: Record<string, number> = { operator: 1, admin: 2 };

export async function mcpTokenRoutes(
  app: FastifyInstance,
  opts: { repo?: UserRepo } = {},
) {
  const repo = opts.repo ?? drizzleUserRepo;

  app.get(
    "/mcp-tokens",
    { preHandler: [requireRole(app, "admin", "operator")] },
    async (_request, reply) => {
      const entries = await readTokenFile();
      return reply.send({
        status: "success",
        message: "OK",
        data: entries.map(({ token: _t, ...meta }) => meta),
      });
    },
  );

  app.get(
    "/mcp-tokens/identities",
    { preHandler: [requireRole(app, "admin", "operator")] },
    async (_request, reply) => {
      const rows = await repo.list();
      const data = rows
        .filter((r) => !r.isDeleted && ROLE_RANK[r.role] !== undefined)
        .map((r) => ({
          userCode: r.userCode,
          userName: r.userName,
          role: r.role,
        }));
      return reply.send({ status: "success", message: "OK", data });
    },
  );

  app.post(
    "/mcp-tokens",
    { preHandler: [requireRole(app, "admin", "operator")] },
    async (request, reply) => {
      const body = request.body as { name?: unknown; userCode?: unknown };
      const name =
        typeof body.name === "string" ? body.name.trim().slice(0, 50) : "";
      if (!name) throw new AppError(400, "name is required");
      const userCode =
        typeof body.userCode === "string" ? body.userCode.trim() : "";
      if (!userCode) throw new AppError(400, "userCode is required");

      const user = await repo.findByCode(userCode);
      if (!user || user.isDeleted) {
        throw new AppError(404, "userCode không tồn tại");
      }
      const identityRank = ROLE_RANK[user.role];
      if (identityRank === undefined) {
        throw new AppError(400, "Identity phải là operator hoặc admin");
      }

      const session = (
        request as unknown as {
          session?: { userCode?: string; role?: string };
        }
      ).session;
      const creatorRank = ROLE_RANK[session?.role ?? ""] ?? 0;
      if (creatorRank < identityRank) {
        throw new AppError(
          403,
          "Không được cấp token cho identity role cao hơn mình",
        );
      }

      const entries = await readTokenFile();
      if (entries.some((e) => e.name === name && !e.revoked)) {
        throw new AppError(409, "Token name đã tồn tại");
      }
      const entry: McpTokenEntry = {
        name,
        token: newToken(),
        userCode: user.userCode,
        createdBy: session?.userCode ?? null,
        createdAt: new Date().toISOString(),
        revoked: false,
      };
      entries.push(entry);
      await writeTokenFile(entries);
      return reply
        .code(201)
        .send({ status: "success", message: "OK", data: entry });
    },
  );

  app.delete(
    "/mcp-tokens/:name",
    { preHandler: [requireRole(app, "admin", "operator")] },
    async (request, reply) => {
      const { name } = request.params as { name: string };
      const entries = await readTokenFile();
      const entry = entries.find((e) => e.name === name && !e.revoked);
      if (!entry) throw new AppError(404, "Token not found");
      const session = (
        request as unknown as {
          session?: { userCode?: string; role?: string };
        }
      ).session;
      if (session?.role === "operator" && entry.createdBy !== session.userCode) {
        throw new AppError(403, "Chỉ thu hồi token mình đã cấp");
      }
      entry.revoked = true;
      await writeTokenFile(entries);
      return reply.send({ status: "success", message: "Token revoked", data: null });
    },
  );
}
