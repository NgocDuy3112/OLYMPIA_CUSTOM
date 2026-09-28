import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/auth.service.js";
import { AppError } from "../../utils/errors.js";
import {
  newToken,
  readTokenFile,
  writeTokenFile,
  type McpTokenEntry,
} from "./token-store.js";

const ROLES = ["admin", "operator", "agent"];
const SCOPES = ["read", "score", "bank", "judge"];

/** Admin quản lý MCP tokens cho người dùng (tab web). Token hiện 1 lần. */
export async function mcpTokenRoutes(app: FastifyInstance) {
  // GET /mcp-tokens — list metadata (không trả token).
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

  // POST /mcp-tokens — tạo token mới. Body {name!, role?, scopes?}.
  app.post(
    "/mcp-tokens",
    { preHandler: [requireRole(app, "admin", "operator")] },
    async (request, reply) => {
      const body = request.body as { name?: unknown; role?: unknown; scopes?: unknown };
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 50) : "";
      if (!name) throw new AppError(400, "name is required");
      const role = typeof body.role === "string" ? body.role : "agent";
      if (!ROLES.includes(role)) throw new AppError(400, "role invalid");
      const scopes = Array.isArray(body.scopes)
        ? body.scopes.filter((s): s is string => typeof s === "string" && SCOPES.includes(s))
        : ["read"];
      if (scopes.length === 0) throw new AppError(400, "scopes required");
      const session = (
        request as unknown as {
          session?: { userCode?: string; role?: string; operatorScopes?: string | null };
        }
      ).session;
      // Operator chỉ cấp ≤ quyền mình: role agent/operator, scopes ⊂ scopes mình.
      if (session?.role === "operator") {
        if (role === "admin") throw new AppError(403, "Không được cấp role admin");
        const mine = (session.operatorScopes ?? "").split(",").map((s) => s.trim());
        const over = scopes.filter((s) => !mine.includes(s));
        if (over.length > 0) {
          throw new AppError(403, `Scope vượt quyền: ${over.join(", ")}`);
        }
      }
      const entries = await readTokenFile();
      if (entries.some((e) => e.name === name && !e.revoked)) {
        throw new AppError(409, "Token name đã tồn tại");
      }
      const entry: McpTokenEntry = {
        name,
        token: newToken(),
        role,
        scopes,
        createdBy: session?.userCode ?? null,
        createdAt: new Date().toISOString(),
        revoked: false,
      };
      entries.push(entry);
      await writeTokenFile(entries);
      return reply.code(201).send({ status: "success", message: "OK", data: entry });
    },
  );

  // DELETE /mcp-tokens/:name — thu hồi (MCP reload là mất hiệu lực).
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
      // Operator chỉ thu hồi token mình cấp.
      if (session?.role === "operator" && entry.createdBy !== session.userCode) {
        throw new AppError(403, "Chỉ thu hồi token mình đã cấp");
      }
      entry.revoked = true;
      await writeTokenFile(entries);
      return reply.send({ status: "success", message: "Token revoked", data: null });
    },
  );
}
