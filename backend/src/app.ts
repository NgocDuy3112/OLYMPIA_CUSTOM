declare module "fastify" {
    interface FastifyRequest {
        sessionUser?: typeof users.$inferSelect;
    }
}

import { users } from "./db/schema.js";

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";

const ALLOWED_ORIGINS = [
    "https://olympia-custom.io.vn",
    "https://www.olympia-custom.io.vn",
    "https://gameplay.olympia-custom.io.vn",
    "https://portal.olympia-custom.io.vn",
];

export async function buildApp() {
    const app = Fastify({
        logger: env.isProduction
            ? true
            : { transport: { target: "pino-pretty" } },
    });

    await app.register(cors, {
        origin: ALLOWED_ORIGINS,
        credentials: true,
    });

    await app.register(cookie);
    await app.register(sensible);
    await app.register(jwt, { secret: env.gameplay.jwtSecret, namespace: "gameplay" });
    await app.register(jwt, { secret: env.portal.jwtSecret, namespace: "portal" });

    app.get("/health", async () => ({ status: "ok" }));

    return app;
}