/**
 * Bot executor — internal HTTP server for direct commands from the API.
 *
 * Transport (hybrid, per plan):
 * - Commands needing ack (assign role, nickname, lock) arrive here via HTTP
 *   and return a synchronous result. No Valkey ack channel needed.
 * - Fire-and-forget notifications (prematch) arrive via Valkey pub/sub
 *   on oc:live-events — see events/valkey-listener.ts.
 *
 * This server binds to EXECUTOR_PORT (default 8200) on localhost only.
 * It is NOT exposed publicly — only the Fastify API calls it.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Client, GuildMember } from "discord.js";

const EXECUTOR_PORT = Number(process.env.EXECUTOR_PORT ?? 8200);

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

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 64 * 1024) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
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
    } catch {
      // Missing ManageNicknames permission or hierarchy — role still assigned
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
      const body = (await readJson(req)) as Record<string, string>;
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
    console.log(`[Discord] Executor listening on 127.0.0.1:${EXECUTOR_PORT}`);
  });
  return server;
}
