declare module "fastify" {
    interface FastifyRequest {
        sessionUser?: typeof users.$inferSelect;
    }
}

import { users } from "./db/schema/index.js";

import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { authRoutes } from "./modules/auth/routes.js";
import { playerAccountRoutes } from "./modules/auth/player-account.js";
import { googleAuthRoutes } from "./modules/auth/google.js";
import { adminRoutes } from "./modules/admin/routes.js";
import { tournamentRoutes } from "./modules/tournaments/routes.js";
import { questionRoutes } from "./modules/questions/routes.js";
import { MEDIA_MAX_BYTES, MEDIA_MAX_FILES } from "./modules/questions/excel.js";
import { matchRoutes } from "./modules/matches/routes.js";
import { assemblePatchRoutes } from "./modules/matches/assemble-patch.js";
import { liveRoutes } from "./modules/live/routes.js";
import { rosterRoutes } from "./modules/roster/routes.js";
import { matchCodeRoutes } from "./modules/match-codes/routes.js";
import { standingsRoutes } from "./modules/standings/routes.js";
import { gameplayReadRoutes } from "./modules/gameplay-read/routes.js";
import { mcpKeyRoutes } from "./modules/mcp-keys/routes.js";
import { mcpRoutes } from "./modules/mcp/index.js";
import { rtcRoutes } from "./modules/rtc/routes.js";

const DEFAULT_ALLOWED_ORIGINS = [
    "http://localhost:5173",                 // portal (dev)
    "http://localhost:5175",                 // gameplay (dev)
    "https://aoc.olympia-custom.io.vn",
    "https://portal.aoc.olympia-custom.io.vn",
    "https://gameplay.aoc.olympia-custom.io.vn",
    "https://olympia-custom.io.vn",
    "https://portal.olympia-custom.io.vn",
    "https://gameplay.olympia-custom.io.vn",
];

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) || [];
const CORS_ORIGINS = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;

export async function buildApp() {
    const app = Fastify({
        logger: env.isProduction
            ? true
            : { transport: { target: "pino-pretty" } },
        ajv: { customOptions: { coerceTypes: false, removeAdditional: false } },
    });

    await app.register(cors, {
        origin: CORS_ORIGINS,
        credentials: true,
    });

    await app.register(cookie);
    await app.register(sensible);
    await app.register(multipart, {
        limits: { fileSize: MEDIA_MAX_BYTES, files: MEDIA_MAX_FILES, fields: 10 },
    });
    await app.register(jwt, { secret: env.gameplay.jwtSecret, namespace: "GAMEPLAY" });
    await app.register(jwt, { secret: env.portal.jwtSecret, namespace: "PORTAL" });
    await app.register(rateLimit, { global: false });
    await app.register(websocket, {
        options: { maxPayload: 16 * 1024 },
        errorHandler: (error, socket, request) => {
            request.log.warn({ err: error }, "websocket closed");
            try { socket.terminate(); } catch { /* already closed */ }
        }
    });
    await app.register(authRoutes);
    await app.register(playerAccountRoutes);
    await app.register(googleAuthRoutes);
    await app.register(adminRoutes);
    await app.register(tournamentRoutes);
    await app.register(questionRoutes);
    await app.register(matchRoutes);
    await app.register(assemblePatchRoutes);
    await app.register(liveRoutes);
    await app.register(rosterRoutes);
    await app.register(matchCodeRoutes);
    await app.register(standingsRoutes);
    await app.register(gameplayReadRoutes);
    await app.register(mcpKeyRoutes);
    await app.register(mcpRoutes);
    await app.register(rtcRoutes);

    app.get("/health", async () => ({ status: "ok" }));

    return app;
}
