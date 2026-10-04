
import { createServer } from "node:http";
import type { Client, GuildMember } from "discord.js";
import { readJson, sendJson } from "./http.js";
import { createLogger } from "./logger.js";

const EXECUTOR_PORT = Number(process.env.EXECUTOR_PORT ?? 8200);
const MAX_BODY_BYTES = 64 * 1024;

const log = createLogger("executor");

interface AssignBody {
  guildId: string;
  discordUserId: string;
  roleId: string;
  nickname?: string;
}

interface RemoveRoleBody {
  guildId: string;
  discordUserId: string;
  roleId: string;
}

async function fetchMember(
  client: Client,
  guildId: string,
  discordUserId: string,
): Promise<GuildMember> {
  const guild = await client.guilds.fetch(guildId);
  return guild.members.fetch(discordUserId);
}

async function handleAssign(client: Client, body: AssignBody) {
  if (!body.guildId || !body.discordUserId || !body.roleId) {
    throw new Error("guildId, discordUserId and roleId are required");
  }
  const member = await fetchMember(client, body.guildId, body.discordUserId);
  await member.roles.add(body.roleId);
  let nicknameChanged = false;
  if (body.nickname) {
    try {
      await member.setNickname(body.nickname);
      nicknameChanged = true;
    } catch (err) {
      log.warn(`setNickname failed for member ${body.discordUserId}:`, err);
    }
  }
  return {
    ok: true,
    discordUserId: body.discordUserId,
    roleId: body.roleId,
    nicknameChanged,
  };
}

async function handleRemoveRole(client: Client, body: RemoveRoleBody) {
  if (!body.guildId || !body.discordUserId || !body.roleId) {
    throw new Error("guildId, discordUserId and roleId are required");
  }
  const member = await fetchMember(client, body.guildId, body.discordUserId);
  await member.roles.remove(body.roleId);
  return { ok: true, discordUserId: body.discordUserId, roleId: body.roleId };
}

async function handleSyncMembers(client: Client, body: { guildId: string }) {
  if (!body.guildId) throw new Error("guildId is required");
  const guild = await client.guilds.fetch(body.guildId);
  const members = await guild.members.fetch();
  return {
    ok: true,
    mapping: [...members.values()].map((m) => ({
      discordUserId: m.id,
      nickname: m.nickname ?? m.user.globalName ?? m.user.username,
    })),
  };
}

export function startExecutor(client: Client) {
  const server = createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        sendJson(res, 404, { status: "error", message: "Not found" });
        return;
      }
      const body = (await readJson(req, MAX_BODY_BYTES)) as Record<string, string>;
      if (req.url === "/discord/assign") {
        const result = await handleAssign(client, body as unknown as AssignBody);
        sendJson(res, 200, { status: "success", data: result });
      } else if (req.url === "/discord/remove-role") {
        const result = await handleRemoveRole(client, body as unknown as RemoveRoleBody);
        sendJson(res, 200, { status: "success", data: result });
      } else if (req.url === "/discord/sync-members") {
        const result = await handleSyncMembers(client, body as unknown as { guildId: string });
        sendJson(res, 200, { status: "success", data: result });
      } else if (req.url === "/health") {
        sendJson(res, 200, { status: "ok" });
      } else {
        sendJson(res, 404, { status: "error", message: "Not found" });
      }
    } catch (err) {
      sendJson(res, 500, {
        status: "error",
        message: err instanceof Error ? err.message : "Executor failed",
      });
    }
  });

  server.listen(EXECUTOR_PORT, "127.0.0.1", () => {
    log.info(`[Discord] Executor listening on 127.0.0.1:${EXECUTOR_PORT}`);
  });
  return server;
}
