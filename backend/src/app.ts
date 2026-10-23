declare module "fastify" {
    interface FastifyRequest {
        sessionUser?: typeof users.$inferSelect;
    }
}

import { users } from "./db/schema/index.js";

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { authRoutes } from "./modules/auth/routes.js";
import { googleAuthRoutes } from "./modules/auth/google.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { tournamentRoutes } from "./modules/tournaments/routes.js";
import { questionRoutes } from "./modules/questions/routes.js";
import { matchRoutes } from "./modules/matches/routes.js";
import { liveRoutes } from "./modules/live/routes.js";
import { rosterRoutes } from "./modules/roster/routes.js";
import { qualificationRoutes } from "./modules/qualification/routes.js";
import { standingsRoutes } from "./modules/standings/routes.js";
import { gameplayReadRoutes } from "./modules/gameplay-read/routes.js";
import { mcpKeyRoutes } from "./modules/mcp-keys/routes.js";
import { mcpRoutes } from "./modules/mcp/index.js";

const ALLOWED_ORIGINS = [
    "https://olympia-custom.io.vn",
    "https://gameplay.olympia-custom.io.vn",
    "https://portal.olympia-custom.io.vn",
];

export async function buildApp() {
    const app = Fastify({
        logger: env.isProduction
            ? true
            : { transport: { target: "pino-pretty" } },
        // removeAdditional: false — a body that carries a field the route does not
        // declare is rejected, not silently stripped. A client must not be able to
        // send the server something it will quietly ignore.
        ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    });

    await app.register(cors, {
        origin: ALLOWED_ORIGINS,
        credentials: true,
    });

    await app.register(cookie);
    await app.register(sensible);
    await app.register(jwt, { secret: env.gameplay.jwtSecret, namespace: "GAMEPLAY" });
    await app.register(jwt, { secret: env.portal.jwtSecret, namespace: "PORTAL" });
    await app.register(rateLimit, { global: false });
    await app.register(websocket, {
        // Live messages are tiny; the ws default of 100 MiB is an unnecessary opening.
        options: { maxPayload: 16 * 1024 },
        // Errors after the upgrade never reach onError or setErrorHandler: the plugin
        // owns them here. Log at warn (not debug) so a genuine handler bug stays visible,
        // and always terminate so the hub's subscriber is cleaned up via "close".
        errorHandler: (error, socket, request) => {
            request.log.warn({ err: error }, "websocket closed");
            try { socket.terminate(); } catch { /* already closed */ }
        }
    });
    await app.register(authRoutes);
    await app.register(googleAuthRoutes);
    await app.register(adminRoutes);
    await app.register(tournamentRoutes);
    await app.register(questionRoutes);
    await app.register(matchRoutes);
    await app.register(liveRoutes);
    await app.register(rosterRoutes);
    await app.register(qualificationRoutes);
    await app.register(standingsRoutes);
    await app.register(gameplayReadRoutes);
    await app.register(mcpKeyRoutes);
    await app.register(mcpRoutes);

    app.get("/health", async () => ({ status: "ok" }));

    return app;
}