/**
 * WebSocket route + connection lifecycle.
 */

import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { manager } from "./ws.manager.js";
import { handleWsMessage, handleReconnect } from "./ws.handler.js";
import { getSession } from "../auth/auth.service.js";
import { drizzleMatchRepo } from "../match/match.repo.js";
import { drizzleTournamentRepo } from "../tournament/tournament.repo.js";
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

      const matchRow = await drizzleMatchRepo.findByCode(matchCode);
      if (!matchRow) {
        socket.close(4004, "Match not found");
        return;
      }

      const tournamentFormat = toTournamentFormat(
        (matchRow as { tournamentFormat?: string }).tournamentFormat ?? "oc3",
      );
      if (!tournamentFormat) {
        socket.close(4002, "Unsupported tournament format");
        return;
      }

      const userCode = session.userCode;

      // Determine game role: admin/controller-scope -> controller,
      // mc-scope -> mc, else per-tournament membership, else player.
      let gameRole: "controller" | "mc" | "player" = "player";

      const sessionScopes = (
        (session as { operatorScopes?: string | null }).operatorScopes ?? ""
      )
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (session.role === "admin" || sessionScopes.includes("controller")) {
        gameRole = "controller";
      } else if (sessionScopes.includes("mc")) {
        gameRole = "mc";
      } else if (session.role === "operator") {
        // Operator without controller/mc scope stays player in game
        gameRole = "player";
      } else {
        // Look up tournament for this match, then check per-tournament role
        const tournamentId = (matchRow as { tournamentId?: string | null })
          .tournamentId;
        if (tournamentId) {
          const membership = await drizzleTournamentRepo.findMember(
            tournamentId,
            session.userId,
          );
          if (membership) {
            const tRole = membership.role;
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
  if (value === "oc3" || value === "oc4") return value;
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
