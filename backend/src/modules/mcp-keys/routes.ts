import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { McpKeyError, toHttpStatus } from "./errors.js";
import { CreateMcpKeyInput, ListMcpKeysQuery } from "./schemas.js";
import { createMcpKey, listMcpKeys, revokeMcpKey } from "./service.js";
import { auditFromRequest } from "../audit/service.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const idParams = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string", pattern: UUID_PATTERN } },
} as const;


export async function mcpKeyRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof McpKeyError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details }),
            });
            return;
        }
        if (error instanceof PaginationError) {
            reply.code(400).send({ error: "VALIDATION", message: error.message });
            return;
        }
        reply.send(error);
    });

    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    // The raw token is in this response and nowhere else, ever.
    app.post(
        "/portal/mcp-keys",
        { onRequest: staff, schema: { body: CreateMcpKeyInput } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const issued = await createMcpKey(user.id, request.body as CreateMcpKeyInput);

            // Details never contain the token — only its identifying prefix.
            await auditFromRequest(request, "mcp_key_issued", {
                targetId: user.id,
                details: {
                    mcpKeyId: issued.key.id,
                    prefix: issued.key.prefix,
                    label: issued.key.label,
                    scopes: issued.key.scopes,
                    expiresAt: issued.key.expiresAt
                }
            });

            reply.code(201);
            return issued;
        }
    );

    app.get(
        "/portal/mcp-keys",
        { onRequest: staff, schema: { querystring: ListMcpKeysQuery } },
        async (request) => {
            const user = request.sessionUser!;
            const query = request.query as ListMcpKeysQuery;

            // Operators see only their own keys; admins see everything
            // (the doc's manual cleanup of stale or suspicious keys).
            const userId = user.role === "ADMIN" ? query.userId : user.id;

            return listMcpKeys({ userId }, parsePage(query));
        }
    );

    // DELETE = revoke. One-way, idempotent, and the row survives (audit history).
    app.delete(
        "/portal/mcp-keys/:id",
        { onRequest: staff, schema: { params: idParams } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { id } = request.params as { id: string };

            const revoked = await revokeMcpKey(id, user.role === "ADMIN" ? {} : { userId: user.id });

            await auditFromRequest(request, "mcp_key_revoked", {
                targetId: revoked.userId,
                details: { mcpKeyId: revoked.id, prefix: revoked.prefix, label: revoked.label }
            });

            return reply.code(204).send();
        }
    );
}
