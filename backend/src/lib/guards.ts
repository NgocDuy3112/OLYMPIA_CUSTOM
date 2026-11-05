import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/pool.js";
import { users } from "../db/schema/auth.js";
import { COOKIE_NAMES, verifyToken, type Surface } from "./jwt.js";


async function authenticate(request: FastifyRequest, surface: Surface) {
    const app = request.server;
    const token = request.cookies[COOKIE_NAMES[surface]];
    if (!token) {
        throw app.httpErrors.unauthorized("Missing session cookie");
    }

    let payload;
    try {
        payload = verifyToken(app, surface, token);
    } catch {
        throw app.httpErrors.unauthorized("Invalid or expired session");
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, payload.sub))
        .limit(1);

    if (!user) {
        throw app.httpErrors.unauthorized("Account not found");
    }
    if (user.disabledAt) {
        throw app.httpErrors.unauthorized("Account disabled");
    }
    if (user.tokenVersion !== payload.tokenVersion) {
        throw app.httpErrors.unauthorized("Session revoked");
    }

    return user;
}

/**
 * The routes a player reaches while `mustChangePassword` is still set — exactly
 * the three that let them clear it, learn who they are, or leave. Anything else
 * is play, and play waits for their own password.
 */
const PASSWORD_CHANGE_EXEMPT = new Set([
    "/gameplay/auth/me",
    "/gameplay/auth/logout",
    "/gameplay/auth/change-password",
]);

export function requireAuth(surface: Surface) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
        const user = await authenticate(request, surface);

        // THE GATE (step 8): while the player is still on the desk's first
        // password, every authenticated route except these three answers 409 —
        // and those three are exactly the ones that let them clear it (change
        // it, find out who they are, or leave). Sending the reply here stops the
        // lifecycle, so no handler underneath can be reached by skipping a UI.
        if (user.mustChangePassword) {
            const path = request.url.split("?")[0] ?? request.url;
            if (!PASSWORD_CHANGE_EXEMPT.has(path)) {
                return reply.code(409).send({
                    error: "PASSWORD_CHANGE_REQUIRED",
                    message: "Hãy đặt mật khẩu của bạn trước khi tiếp tục.",
                });
            }
        }

        request.sessionUser = user;
    };
}

export function requireRole(surface: Surface, roles: Array<"ADMIN" | "OPERATOR">) {
    return async (request: FastifyRequest) => {
        const user = await authenticate(request, surface);
        if (!roles.includes(user.role as "ADMIN" | "OPERATOR")) {
            throw request.server.httpErrors.forbidden("Insufficient role");
        }
        request.sessionUser = user;
    };
}
