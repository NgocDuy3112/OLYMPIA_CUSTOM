import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { getEnv } from "../config/env.js";

export async function registerCors(app: FastifyInstance) {
  const env = getEnv();
  const origins =
    env.CORS_ORIGINS === "*"
      ? "*"
      : env.CORS_ORIGINS.split(",").map((o) => o.trim());

  await app.register(cors, {
    origin: origins,
    credentials: false,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });
}
