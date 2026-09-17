import type { FastifyInstance } from "fastify";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { requireRole } from "../auth/auth.service.js";
import {
  VALID_ACTIONS,
  auditDir,
  type AuditEntry,
} from "./audit.service.js";

export { writeAudit } from "./audit.service.js";

async function readAuditFiles(): Promise<AuditEntry[]> {
  let files: string[] = [];
  try {
    files = (await readdir(auditDir())).filter(
      (f) => f.startsWith("audit-") && f.endsWith(".log"),
    );
  } catch {
    return [];
  }
  // Newest file first
  files.sort().reverse();
  const entries: AuditEntry[] = [];
  for (const file of files.slice(0, 30)) {
    try {
      const content = await readFile(join(auditDir(), file), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          entries.push(JSON.parse(trimmed) as AuditEntry);
        } catch {
          /* skip malformed line */
        }
      }
    } catch {
      /* skip unreadable file */
    }
  }
  // Newest entry first
  entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return entries;
}

export async function auditRoutes(app: FastifyInstance) {
  // GET /audit-logs — filter by action/actor/match, latest first (admin only)
  app.get(
    "/audit-logs",
    { preHandler: [requireRole(app, "admin")] },
    async (request, reply) => {
      const query = request.query as {
        action?: string;
        actor?: string;
        match?: string;
        limit?: string;
        offset?: string;
      };
      const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200);
      const offset = Math.max(Number(query.offset) || 0, 0);

      const all = await readAuditFiles();
      const filtered = all.filter((e) => {
        if (
          query.action &&
          (VALID_ACTIONS as readonly string[]).includes(query.action) &&
          e.actionType !== query.action
        )
          return false;
        if (query.actor && e.actorCode !== query.actor) return false;
        if (query.match && e.matchCode !== query.match) return false;
        return true;
      });

      return reply.send({
        status: "success",
        message: "OK",
        data: {
          logs: filtered.slice(offset, offset + limit),
          total: filtered.length,
        },
      });
    },
  );
}
