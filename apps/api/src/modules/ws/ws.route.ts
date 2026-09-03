/**
 * WebSocket route + connection lifecycle.
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { manager } from "./ws.manager.js";
import { handleWsMessage, handleReconnect } from "./ws.handler.js";
import { getSession } from "../auth/auth.service.js";
import { eq, and } from "drizzle-orm";
import { db, matches, tournaments, tournamentPlayers } from "@oc/db";
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
      
      // Determine per-tournament role for this match
      let gameRole: "controller" | "mc" | "player" = "player";
      
      // Global admin gets controller role in any game
      if (session.role === "admin") {
        gameRole = "controller";
      } else {
        // Look up tournament for this match, then check per-tournament role
        const matchWithTournament = await db
          .select({ tournamentId: matches.tournamentId })
          .from(matches)
          .where(eq(matches.matchCode, matchCode))
          .limit(1);
        
        if (matchWithTournament[0]?.tournamentId) {
          const membership = await db
            .select({ role: tournamentPlayers.role })
            .from(tournamentPlayers)
            .where(
              and(
                eq(tournamentPlayers.tournamentId, matchWithTournament[0].tournamentId),
                eq(tournamentPlayers.playerId, session.userId),
              ),
            )
            .limit(1);
          
          if (membership[0]) {
            const tRole = membership[0].role;
            if (tRole === "controller" || tRole === "mc") {
              gameRole = tRole;
            }
          }
        }
      }

      const conn = {
        ws: socket,
        matchCode,
        userId: userCode,
        userCode,
        role: gameRole,
        sid,
        tournamentFormat,
      };

      // Register connection
      manager.connect(socket, matchCode, userCode, gameRole, sid, tournamentFormat);

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
