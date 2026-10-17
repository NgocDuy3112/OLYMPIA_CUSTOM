import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { hostHeaderValidation, originValidation } from "@modelcontextprotocol/fastify";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { createMcpHandler, localhostAllowedHostnames, localhostAllowedOrigins } from "@modelcontextprotocol/server";
import { verifyMcpToken } from "../mcp-keys/index.js";
import { McpKeyError } from "../mcp-keys/errors.js";
import { buildMcpServer } from "./server.js";


const handler = createMcpHandler(() => buildMcpServer());
const node = toNodeHandler(handler);


export async function mcpRoutes(app: FastifyInstance) {
    // Host/Origin checks, scoped to /mcp only. Add public hostnames to the lists for production.
    const hostCheck = hostHeaderValidation(localhostAllowedHostnames());
    const originCheck = originValidation(localhostAllowedOrigins());

    // Bearer auth → authInfo. Role check kept outside the try so it isn't swallowed.
    const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
        const header = request.headers.authorization ?? "";
        const token = header.startsWith("Bearer ") ? header.slice(7) : "";
        if (!token) return reply.code(401).send({ error: "UNAUTHORIZED", message: "Missing bearer token" });

        let verified;
        try {
            verified = await verifyMcpToken(token, {
                ip: request.ip,
                userAgent: request.headers["user-agent"],
            });
        } catch (error) {
            if (error instanceof McpKeyError) {
                return reply.code(401).send({ error: "UNAUTHORIZED", message: error.message });
            }
            throw error;
        }

        if (!["ADMIN", "OPERATOR"].includes(verified.user.role)) {
            return reply.code(403).send({ error: "FORBIDDEN", message: "Insufficient role" });
        }

        // Handlers read this via ctx.http.authInfo.
        (request.raw as any).auth = {
            token,
            clientId: verified.key.id,
            scopes: verified.key.scopes,
            extra: { userId: verified.user.id, role: verified.user.role },
        };
    };

    app.all(
        "/mcp",
        { onRequest: [hostCheck, originCheck, authenticate] },
        async (request, reply) => node(request.raw, reply.raw, request.body)
    );
}