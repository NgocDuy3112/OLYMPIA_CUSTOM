import type { FastifyInstance } from "fastify";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        namespaces: "GAMEPLAY" | "PORTAL";
    }
}

export type Surface = "GAMEPLAY" | "PORTAL";

export const COOKIE_NAMES: Record<Surface, string> = {
    GAMEPLAY: "gameplay_session",
    PORTAL: "portal_session",
};

export interface SessionToken {
    sub: string;
    role: "ADMIN" | "OPERATOR" | "PLAYER";
    tokenVersion: number;
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


export interface PendingMfaToken {
    sub: string;
    purpose: "mfa";
}


export function signPending(
    app: FastifyInstance,
    surface: Surface,
    payload: PendingMfaToken
): string {
    return app.jwt[surface].sign(payload, { aud: surface, expiresIn: "5m" });
}


export function verifyPending(
    app: FastifyInstance,
    surface: Surface,
    token: string
): PendingMfaToken {
    return app.jwt[surface].verify(token, { allowedAud: surface }) as PendingMfaToken;
}


export interface OauthPendingToken {
    state: string;
    nonce: string;
    codeVerifier: string;
    purpose: "oauth";
    next?: string;
}

export function signOauthPending(app: FastifyInstance, payload: OauthPendingToken): string {
    return app.jwt.GAMEPLAY.sign(payload, { aud: "GAMEPLAY", expiresIn: "10m" });
}

export function verifyOauthPending(app: FastifyInstance, token: string): OauthPendingToken {
    return app.jwt.GAMEPLAY.verify(token, { allowedAud: "GAMEPLAY" }) as OauthPendingToken;
}



export interface InviteToken {
    sub: string;
    tokenVersion: number;
    purpose: "invite";
}

export function signInvite(app: FastifyInstance, payload: InviteToken): string {
    return app.jwt.PORTAL.sign(payload, { aud: "PORTAL", expiresIn: "7d" });
}

export function verifyInvite(app: FastifyInstance, token: string): InviteToken {
    return app.jwt.PORTAL.verify(token, { allowedAud: "PORTAL" }) as InviteToken;
}