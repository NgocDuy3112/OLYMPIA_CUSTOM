import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { closePool } from "./db/pool.js";

async function main() {
    const app = await buildApp();

    const shutdown = async (signal: string) => {
        app.log.info(`Received ${signal}, shutting down`);
        await app.close();
        await closePool();
        process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    await app.listen({ port: env.port, host: "0.0.0.0" });
}

main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});