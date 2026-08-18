import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { manager } from "./modules/ws/ws.manager.js";

async function main() {
  const env = getEnv();
  const app = await createApp();

  // Connect Valkey to WS manager
  manager.setValkey(app.valkey);

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🚀 API server running at http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down...");
    manager.shutdown();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
