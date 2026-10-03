import type { FastifyInstance } from "fastify";
import type { ServerResponse } from "node:http";
import { requireRole } from "../auth/auth.service.js";

const listeners = new Set<ServerResponse>();

function send(res: ServerResponse, event: string): void {
  try {
    res.write(`data: ${event}\n\n`);
  } catch {
    listeners.delete(res);
  }
}

export function emitBankChanged(): void {
  const event = JSON.stringify({ type: "bank_changed", at: Date.now() });
  for (const res of listeners) send(res, event);
}

export async function bankEventsRoutes(app: FastifyInstance) {
  app.get(
    "/bank/events",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      reply.hijack();
      const raw = reply.raw;
      raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      raw.write(": connected\n\n");
      listeners.add(raw);
      const heartbeat = setInterval(() => {
        try {
          raw.write(": ping\n\n");
        } catch {
          clearInterval(heartbeat);
          listeners.delete(raw);
        }
      }, 25000);
      request.raw.on("close", () => {
        clearInterval(heartbeat);
        listeners.delete(raw);
      });
    },
  );
}
