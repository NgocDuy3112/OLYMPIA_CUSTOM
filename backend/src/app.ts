import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import { env } from "./config/env.js";

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

    app.get("/health", async () => ({ status: "ok" }));

    return app;
}