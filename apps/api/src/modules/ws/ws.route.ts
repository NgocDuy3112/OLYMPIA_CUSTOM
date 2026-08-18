/**
 * WebSocket route + connection lifecycle.
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { manager } from "./ws.manager.js";
import { handleWsMessage, handleReconnect } from "./ws.handler.js";
import { getSession } from "../auth/auth.service.js";
import { eq, and } from "drizzle-orm";
import { db, matches } from "@oc/db";
import type { TournamentFormat } from "@oc/shared";

const COOKIE_NAME = "sid";

export async function wsRoute(app: FastifyInstance) {
  app.get(
    "/ws/:matchCode",
    { websocket: true },
    async (socket: WebSocket, request) => {
      const matchCode = (request.params as any).matchCode as string;

      // Extract session from cookie or query param
      const cookies = parseCookies(request.headers.cookie || "");
      const sid = cookies[COOKIE_NAME] || (request.query as any).sid;

      if (!sid) {
        socket.close(4001, "Missing authentication");
        return;
      }

      const session = await getSession(app.valkey, sid);
      if (!session) {
        socket.close(4001, "Invalid session");
        return;
      }

      const matchRows = await db
        .select({ tournamentFormat: matches.tournamentFormat })
        .from(matches)
        .where(
          and(eq(matches.matchCode, matchCode), eq(matches.isDeleted, false)),
        )
        .limit(1);
      if (matchRows.length === 0) {
        socket.close(4004, "Match not found");
        return;
      }

      const tournamentFormat = toTournamentFormat(
        matchRows[0].tournamentFormat,
      );
      if (!tournamentFormat) {
        socket.close(4002, "Unsupported tournament format");
        return;
      }

      const userCode = session.userCode;
      const role = session.role;

      const conn = {
        ws: socket,
        matchCode,
        userId: userCode,
        userCode,
        role: role as "admin" | "mc" | "player",
        sid,
        tournamentFormat,
      };

      // Register connection
      manager.connect(socket, matchCode, userCode, role, sid, tournamentFormat);

      // Handle reconnect
      handleReconnect(conn);

      // Message handler
      socket.on("message", async (raw) => {
        try {
          const data = JSON.parse(raw.toString());
          await handleWsMessage(socket, conn, data);
        } catch {
          /* ignore malformed messages */
        }
      });

      // Disconnect handler
      socket.on("close", () => {
        manager.disconnect(socket);
      });
    },
  );
}

function toTournamentFormat(value: string): TournamentFormat | null {
  if (value === "oc3" || value === "oc4" || value === "ochcmc") return value;
  return null;
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const [key, ...rest] = pair.split("=");
    if (key) cookies[key.trim()] = rest.join("=").trim();
  }
  return cookies;
}
