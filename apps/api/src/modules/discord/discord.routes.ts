import { AppError } from "../../utils/errors.js";
import type { FastifyInstance } from "fastify";
import { requireAuth, reqSession } from "../auth/auth.service.js";
import { writeAudit } from "../audit/audit.service.js";
import { getEnv } from "../../config/env.js";
import { drizzleDiscordRepo, type DiscordRepo } from "./discord.repo.js";

const DISCORD_COMMAND_TIMEOUT_MS = 10_000;

function botExecutorUrl(): string {
  const env = getEnv() as Record<string, unknown>;
  return (
    (env["BOT_EXECUTOR_URL"] as string | undefined) ??
    "http://localhost:8200"
  );
}

async function callBot(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${botExecutorUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DISCORD_COMMAND_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Bot error (${response.status}): ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as Record<string, unknown>;
}

type Session = { userId: string; role: string; userCode: string };

async function requireTournamentStaff(
  repo: DiscordRepo,
  tournamentId: string,
  session: Session,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (session.role === "admin") return { ok: true };
  const membership = await repo.findMembership(tournamentId, session.userId);
  const role = membership?.role;
  if (role === "controller" || role === "mc") return { ok: true };
  return {
    ok: false,
    message: `Role '${role ?? session.role}' cannot manage Discord roles`,
  };
}

function parseRoleMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, string>;
    }
  } catch {
  }
  return {};
}

export async function discordRoutes(
  app: FastifyInstance,
  opts: { repo?: DiscordRepo } = {},
) {
  const repo = opts.repo ?? drizzleDiscordRepo;
  const resolveTournament = (code: string) => repo.findTournamentByCode(code);
  const gateFor = (tournamentId: string, session: Session) =>
    requireTournamentStaff(repo, tournamentId, session);
  app.get(
    "/discord/:code/players",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const tournament = await resolveTournament(code);
      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }
      const rows = await repo.listTournamentMembers(tournament.id);
      return reply.send({ status: "success", message: "OK", data: rows });
    },
  );

  app.post(
    "/discord/:code/assign",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { userCode: string };
      const session = reqSession(request);

      const tournament = await resolveTournament(code);
      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        throw new AppError(403, gate.message);
      }
      if (!tournament.discordGuildId) {
        throw new AppError(400, "Tournament has no discord_guild_id configured");
      }

      const target = await repo.findMemberByUserCode(
        tournament.id,
        body.userCode,
      );

      if (!target) {
        throw new AppError(404, "User is not registered in this tournament");
      }
      if (!target.discordUserId) {
        throw new AppError(400, "Member has no discord_user_id linked");
      }

      const roleMap = parseRoleMap(tournament.discordRoleMap);
      const roleId = roleMap[target.role];
      if (!roleId) {
        throw new AppError(400, `No Discord role mapped for tournament role '${target.role}'`);
      }

      const result = await callBot("/discord/assign", {
        guildId: tournament.discordGuildId,
        discordUserId: target.discordUserId,
        roleId,
        nickname: target.discordNickname ?? target.userName,
      });

      await writeAudit({
        actionType: "PLAYER_JOIN",
        actorCode: session.userCode,
        targetCode: body.userCode,
        details: `Discord assign role '${target.role}' in ${code}`,
      });

      return reply.send({ status: "success", message: "OK", data: result });
    },
  );

  app.post(
    "/discord/:code/sync-nicknames",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as {
        mapping: Array<{ discordUserId: string; nickname: string }>;
      };
      const session = reqSession(request);

      const tournament = await resolveTournament(code);
      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        throw new AppError(403, gate.message);
      }

      let updated = 0;
      for (const entry of body.mapping ?? []) {
        if (!entry.discordUserId) continue;
        await repo.updateNicknameByDiscordId(
          tournament.id,
          entry.discordUserId,
          entry.nickname,
        );
        updated += 1;
      }
      return reply.send({
        status: "success",
        message: "OK",
        data: { updated },
      });
    },
  );

  app.post(
    "/discord/:code/notify-prematch",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { matchCode?: string; startsAt?: string };
      const session = reqSession(request);

      const tournament = await resolveTournament(code);
      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        throw new AppError(403, gate.message);
      }

      const playerRows = await repo.listPlayerDiscord(tournament.id);

      await app.valkey.publish(
        "oc:live-events",
        JSON.stringify({
          type: "prematch_notify",
          tournament_code: code,
          match_code: body.matchCode,
          starts_at: body.startsAt,
          channel_id: tournament.discordNotifyChannelId,
          players: playerRows.map((p) => ({
            discord_user_id: p.discordUserId,
            nickname: p.discordNickname ?? p.userName,
          })),
        }),
      );

      return reply.send({
        status: "success",
        message: "OK",
        data: { notified: playerRows.length },
      });
    },
  );

  app.post(
    "/discord/:code/lock",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { userCode: string; matchCode?: string };
      const session = reqSession(request);

      const tournament = await resolveTournament(code);
      if (!tournament) {
        throw new AppError(404, "Tournament not found");
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        throw new AppError(403, gate.message);
      }
      if (!tournament.discordGuildId) {
        throw new AppError(400, "Tournament has no discord_guild_id configured");
      }

      const target = await repo.findMemberByUserCode(
        tournament.id,
        body.userCode,
      );

      if (!target || !target.discordUserId) {
        throw new AppError(404, "Member not found or has no discord_user_id");
      }

      const roleMap = parseRoleMap(tournament.discordRoleMap);
      const roleId = roleMap[target.role];
      if (!roleId) {
        throw new AppError(400, `No Discord role mapped for tournament role '${target.role}'`);
      }

      const result = await callBot("/discord/remove-role", {
        guildId: tournament.discordGuildId,
        discordUserId: target.discordUserId,
        roleId,
      });

      await writeAudit({
        actionType: "PLAYER_LEAVE",
        actorCode: session.userCode,
        matchCode: body.matchCode,
        targetCode: body.userCode,
        details: `Discord lock (role removed) in ${code}`,
      });

      return reply.send({ status: "success", message: "OK", data: result });
    },
  );
}
