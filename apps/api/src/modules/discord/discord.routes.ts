import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/auth.service.js";
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

/** Caller must be controller/mc of this tournament, or global admin. */
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
    /* ignore malformed map */
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
  // GET /discord/:code/players — lookup Discord identity (read, any auth user)
  app.get(
    "/discord/:code/players",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const tournament = await resolveTournament(code);
      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
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
      const session = (request as unknown as { session: { userId: string; role: string; userCode: string } }).session;

      const tournament = await resolveTournament(code);
      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        return reply.code(403).send({
          status: "error",
          message: gate.message,
          data: null,
        });
      }
      if (!tournament.discordGuildId) {
        return reply.code(400).send({
          status: "error",
          message: "Tournament has no discord_guild_id configured",
          data: null,
        });
      }

      // Resolve target member by userCode within this tournament
      const target = await repo.findMemberByUserCode(
        tournament.id,
        body.userCode,
      );

      if (!target) {
        return reply.code(404).send({
          status: "error",
          message: "User is not registered in this tournament",
          data: null,
        });
      }
      if (!target.discordUserId) {
        return reply.code(400).send({
          status: "error",
          message: "Member has no discord_user_id linked",
          data: null,
        });
      }

      const roleMap = parseRoleMap(tournament.discordRoleMap);
      const roleId = roleMap[target.role];
      if (!roleId) {
        return reply.code(400).send({
          status: "error",
          message: `No Discord role mapped for tournament role '${target.role}'`,
          data: null,
        });
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

  // POST /discord/:code/sync-nicknames — upsert nicknames from bot (staff only)
  app.post(
    "/discord/:code/sync-nicknames",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as {
        mapping: Array<{ discordUserId: string; nickname: string }>;
      };
      const session = (request as unknown as { session: { userId: string; role: string; userCode: string } }).session;

      const tournament = await resolveTournament(code);
      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        return reply.code(403).send({
          status: "error",
          message: gate.message,
          data: null,
        });
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

  // POST /discord/:code/notify-prematch — fire-and-forget via Valkey (staff only)
  app.post(
    "/discord/:code/notify-prematch",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { matchCode?: string; startsAt?: string };
      const session = (request as unknown as { session: { userId: string; role: string; userCode: string } }).session;

      const tournament = await resolveTournament(code);
      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        return reply.code(403).send({
          status: "error",
          message: gate.message,
          data: null,
        });
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

  // POST /discord/:code/lock — remove match role from member (staff only)
  app.post(
    "/discord/:code/lock",
    { preHandler: [requireAuth(app)] },
    async (request, reply) => {
      const { code } = request.params as { code: string };
      const body = request.body as { userCode: string; matchCode?: string };
      const session = (request as unknown as { session: { userId: string; role: string; userCode: string } }).session;

      const tournament = await resolveTournament(code);
      if (!tournament) {
        return reply.code(404).send({
          status: "error",
          message: "Tournament not found",
          data: null,
        });
      }
      const gate = await gateFor(tournament.id, session);
      if (!gate.ok) {
        return reply.code(403).send({
          status: "error",
          message: gate.message,
          data: null,
        });
      }
      if (!tournament.discordGuildId) {
        return reply.code(400).send({
          status: "error",
          message: "Tournament has no discord_guild_id configured",
          data: null,
        });
      }

      const target = await repo.findMemberByUserCode(
        tournament.id,
        body.userCode,
      );

      if (!target || !target.discordUserId) {
        return reply.code(404).send({
          status: "error",
          message: "Member not found or has no discord_user_id",
          data: null,
        });
      }

      const roleMap = parseRoleMap(tournament.discordRoleMap);
      const roleId = roleMap[target.role];
      if (!roleId) {
        return reply.code(400).send({
          status: "error",
          message: `No Discord role mapped for tournament role '${target.role}'`,
          data: null,
        });
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
