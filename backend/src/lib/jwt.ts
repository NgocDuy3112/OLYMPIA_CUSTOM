import type { FastifyInstance } from "fastify";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        namespaces: "gameplay" | "portal";
    }
}

export type Surface = "gameplay" | "portal";

export const COOKIE_NAMES: Record<Surface, string> = {
    gameplay: "gameplay_session",
    portal: "portal_session",
};

export interface SessionToken {
    sub: string;
    role: "admin" | "operator" | "player";
    tv: number;
}


export function signToken(
    app: FastifyInstance,
    surface: Surface,
    payload: SessionToken
): string {
    return app.jwt[surface].sign(payload, {
        aud: surface,
        expiresIn: "12h",
    });
}

export function verifyToken(
    app: FastifyInstance,
    surface: Surface,
    token: string
): SessionToken {
    return app.jwt[surface].verify(token, {
        allowedAud: surface,
    }) as SessionToken;
}