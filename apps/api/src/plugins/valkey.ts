import type { FastifyInstance } from "fastify";
import Redis from "ioredis";
import { getEnv } from "../config/env.js";
import fp from "fastify-plugin";

// Extend FastifyInstance to carry valkey
declare module "fastify" {
  interface FastifyInstance {
    valkey: Redis;
    valkeySub: Redis;
  }
}

// ── Shared async factory ──

export interface ValkeyClients {
  client: Redis;
  subscriber: Redis;
}

export async function createValkeyClients(opts?: {
  host?: string;
  port?: number;
  password?: string;
  username?: string;
}): Promise<ValkeyClients> {
  const env = getEnv();
  const host = opts?.host ?? env.VALKEY_HOST;
  const port = opts?.port ?? env.VALKEY_PORT;
  const password = opts?.password ?? env.VALKEY_PASSWORD;
  const username = opts?.username ?? env.VALKEY_USER;

  const makeClient = () => {
    const client = new Redis({
      host,
      port,
      password: password || undefined,
      username: username || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
    });
    return client;
  };

  const client = makeClient();
  const subscriber = makeClient();

  await Promise.race([
    new Promise<void>((resolve) => client.once("ready", resolve)),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Valkey connection timeout")), 5000),
    ),
  ]);

  return { client, subscriber };
}

// ── Fastify plugin ──

async function valkeyPlugin(app: FastifyInstance) {
  const { client, subscriber } = await createValkeyClients();

  client.on("connect", () => app.log.info("Valkey connected"));
  client.on("error", (err) => app.log.error({ err }, "Valkey error"));
  subscriber.on("error", (err) =>
    app.log.error({ err }, "Valkey subscriber error"),
  );

  app.decorate("valkey", client);
  app.decorate("valkeySub", subscriber);

  app.addHook("onClose", async () => {
    subscriber.disconnect();
    client.disconnect();
  });
}

export default fp(valkeyPlugin, { name: "valkey" });
