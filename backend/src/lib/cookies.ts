import type { FastifyReply } from "fastify";
import { env } from "../config/env.js";
import { COOKIE_NAMES, type Surface } from "./jwt.js";

export function setSessionCookie(reply: FastifyReply, surface: Surface, token: string) {
    reply.setCookie(COOKIE_NAMES[surface], token, {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 12 * 60 * 60, // matches JWT expiresIn: "12h"
    });
}

export function clearSessionCookie(reply: FastifyReply, surface: Surface) {
    reply.clearCookie(COOKIE_NAMES[surface], { path: "/" });
}