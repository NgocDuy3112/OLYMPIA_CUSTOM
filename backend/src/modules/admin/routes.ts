import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { acceptInvite, createOperator } from "./service.js";


const createBody = {
    type: "object",
    required: ["username"],
    additionalProperties: false,
    properties: {
        username: { type: "string", minLength: 3, maxLength: 50, pattern: "^[a-zA-Z0-9._-]+$" },
        displayName: { type: "string", minLength: 1, maxLength: 100 },
    },
} as const;

const acceptBody = {
    type: "object",
    required: ["token", "password"],
    additionalProperties: false,
    properties: {
        token: { type: "string", minLength: 1 },
        password: { type: "string", minLength: 1, maxLength: 256 },
    },
} as const;

export async function adminRoutes(app: FastifyInstance) {
    // Admin-only: operators must not create more operators.
    app.post(
        "/portal/operators",
        {
            onRequest: [requireRole("PORTAL", "ADMIN")],
            schema: { body: createBody },
        },
        async (request, reply) => {
            const { username, displayName } = request.body as {
                username: string;
                displayName?: string;
            };
            const result = await createOperator(app, username, displayName);
            reply.code(201);
            return result;
        }
    );

    // Public: the invitee has no session yet. JWT + rate limit guard it.
    app.post(
        "/portal/invites/accept",
        {
            config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
            schema: { body: acceptBody },
        },
        async (request) => {
            const { token, password } = request.body as {
                token: string;
                password: string;
            };
            return acceptInvite(app, token, password);
        }
    );
}