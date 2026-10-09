import type { FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/pool.js";
import { users } from "../db/schema.js";
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
    if (user.tokenVersion !== payload.tv) {
        throw app.httpErrors.unauthorized("Session revoked");
    }

    return user;
}

export function requireAuth(surface: Surface) {
    return async (request: FastifyRequest) => {
        request.sessionUser = await authenticate(request, surface);
    };
}

export function requireRole(surface: Surface, ...roles: Array<"admin" | "operator">) {
    return async (request: FastifyRequest) => {
        const user = await authenticate(request, surface);
        if (!roles.includes(user.role as "admin" | "operator")) {
            throw request.server.httpErrors.forbidden("Insufficient role");
        }
        request.sessionUser = user;
    };
}