import type { FastifyInstance } from "fastify";
import { setSessionCookie } from "../../lib/cookies.js";
import { finishMfa, startLogin } from "./service.js";


const loginBody = {
    type: "object",
    required: ["username", "password"],
    additionalProperties: false,
    properties: {
        username: { type: "string", minLength: 1, maxLength: 50 },
        password: { type: "string", minLength: 1, maxLength: 256 },
    },
} as const;

const mfaBody = {
    type: "object",
    required: ["pendingToken", "code"],
    additionalProperties: false,
    properties: {
        pendingToken: { type: "string", minLength: 1 },
        code: { type: "string", pattern: "^[0-9]{6}$" },
    },
} as const;


export async function authRoutes(app: FastifyInstance) {
    const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

    app.post(
        "/portal/auth/login",
        { ...perIp, schema: { body: loginBody } },
        async (request) => {
            const { username, password } = request.body as {
                username: string;
                password: string;
            };
            return startLogin(app, "PORTAL", username, password);
        }
    );

    app.post(
        "/portal/auth/mfa",
        { ...perIp, schema: { body: mfaBody } },
        async (request, reply) => {
            const { pendingToken, code } = request.body as {
                pendingToken: string;
                code: string;
            };
            const token = await finishMfa(app, "PORTAL", pendingToken, code);
            setSessionCookie(reply, "PORTAL", token);
            return { ok: true };
        }
    );
}