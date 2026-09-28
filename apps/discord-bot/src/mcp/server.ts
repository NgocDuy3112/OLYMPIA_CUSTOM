import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type TextChannel,
} from "discord.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Redis from "ioredis";
import { z } from "zod";
import { getEnv } from "../config/env.js";
import {
  loadVerify,
  saveVerify,
  setVerifyFields,
  type VerifyRecord,
} from "./verify-store.js";

const text = (payload: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
});

function allowedChannels(): Set<string> {
  const env = getEnv();
  const extra = env.MCP_ALLOWED_CHANNELS.split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  return new Set([env.NOTIFICATION_CHANNEL_ID, ...extra]);
}

async function resolveChannel(
  client: Client,
  channelId: string,
): Promise<TextChannel | null> {
  if (!allowedChannels().has(channelId)) return null;
  try {
    const ch = await client.channels.fetch(channelId);
    return ch?.isTextBased() ? (ch as TextChannel) : null;
  } catch {
    return null;
  }
}

function verifyButtons(id: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`vf:${id}:yes`)
        .setLabel("✔ Đúng")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`vf:${id}:no`)
        .setLabel("✘ Sai")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`vf:${id}:cancel`)
        .setLabel("Hủy")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function createDiscordMcpServer(client: Client, valkey: Redis): McpServer {
  const env = getEnv();
  const server = new McpServer({ name: "olympia-discord", version: "0.1.0" });

  server.registerTool(
    "send_text",
    {
      description: "Gửi tin text thuần vào kênh Discord (allowlist). Trả messageId.",
      inputSchema: {
        channelId: z.string().describe("ID kênh (phải trong allowlist)"),
        text: z.string().min(1).max(2000),
      },
    },
    async ({ channelId, text: body }) => {
      const channel = await resolveChannel(client, channelId);
      if (!channel) return text({ error: "Kênh không hợp lệ hoặc ngoài allowlist." });
      const msg = await channel.send(body);
      return text({ messageId: msg.id, channelId });
    },
  );

  server.registerTool(
    "verify_request",
    {
      description: "Nhờ qauthor xác nhận thông tin qua nút Discord. Fail-closed: chưa bấm = chưa quyết. requestKey chống spam trùng.",
      inputSchema: {
        question: z.string().min(1).describe("Thông tin cần xác nhận"),
        context: z.string().default(""),
        channelId: z.string().optional().describe("Mặc định kênh thông báo"),
        requestKey: z.string().optional().describe("Idempotency key"),
      },
    },
    async ({ question, context, channelId, requestKey }) => {
      const target = channelId?.trim() || env.NOTIFICATION_CHANNEL_ID;
      const channel = await resolveChannel(client, target);
      if (!channel) return text({ error: "Kênh không hợp lệ hoặc ngoài allowlist." });
      const id =
        requestKey?.trim() ||
        `vf_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
      const existed = await loadVerify(valkey, id);
      if (existed && existed.status === "pending") {
        return text({ verificationId: id, deduped: true, messageId: existed.messageId });
      }
      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("❓ CẦN XÁC NHẬN")
        .setDescription(question.slice(0, 3000))
        .setTimestamp();
      if (context) embed.addFields({ name: "Ngữ cảnh", value: context.slice(0, 1000) });
      const msg = await channel.send({ embeds: [embed], components: verifyButtons(id) });
      const now = new Date().toISOString();
      await saveVerify(
        valkey,
        {
          id,
          question: question.slice(0, 3000),
          context: (context ?? "").slice(0, 1000),
          channelId: target,
          messageId: msg.id,
          status: "pending",
          verdictBy: "",
          decidedAt: "",
          reminds: 0,
          lastRemind: now,
        },
        env.VERIFY_TTL_SEC,
      );
      return text({ verificationId: id, messageId: msg.id, channelId: target });
    },
  );

  server.registerTool(
    "verify_result",
    {
      description:
        "Poll kết quả xác nhận: pending | yes | no | cancelled | expired (mất key).",
      inputSchema: { verificationId: z.string() },
    },
    async ({ verificationId }) => {
      const rec = await loadVerify(valkey, verificationId);
      if (!rec) return text({ status: "expired" });
      return text({
        status: rec.status,
        verdictBy: rec.verdictBy || null,
        decidedAt: rec.decidedAt || null,
        reminds: rec.reminds,
      });
    },
  );

  server.registerTool(
    "verify_cancel",
    {
      description: "Hủy yêu cầu xác nhận đang treo.",
      inputSchema: { verificationId: z.string() },
    },
    async ({ verificationId }) => {
      const rec = await loadVerify(valkey, verificationId);
      if (!rec) return text({ status: "expired" });
      if (rec.status !== "pending") return text({ status: rec.status });
      await setVerifyFields(valkey, verificationId, {
        status: "cancelled",
        decidedAt: new Date().toISOString(),
      });
      return text({ status: "cancelled" });
    },
  );

  return server;
}

function requiredRoles(): Set<string> {
  return new Set(
    getEnv()
      .VERIFY_ROLE_IDS.split(",")
      .map((s: string) => s.trim())
      .filter(Boolean),
  );
}

/** Branch nút vf: — gọi từ bot InteractionCreate, trước handleReviewButton. */
export async function handleVerifyButton(
  interaction: ButtonInteraction,
): Promise<boolean> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "vf" || parts.length !== 3) return false;
  const valkey = getVerifyValkey();
  const [, id, action] = parts;
  const rec = await loadVerify(valkey, id);
  if (!rec) {
    await interaction.reply({ content: "Yêu cầu đã hết hạn.", ephemeral: true });
    return true;
  }
  if (rec.status !== "pending") {
    await interaction.reply({
      content: `Đã ${rec.status} bởi ${rec.verdictBy || "?"}.`,
      ephemeral: true,
    });
    return true;
  }
  const roles = requiredRoles();
  if (roles.size > 0) {
    const member = interaction.member;
    let ids: string[] = [];
    if (member && typeof member === "object" && "roles" in member) {
      const mr = (member as { roles: unknown }).roles;
      if (Array.isArray(mr)) ids = mr.filter((x): x is string => typeof x === "string");
      else if (mr && typeof mr === "object" && "cache" in mr) {
        ids = [...((mr as { cache: Map<string, { id: string }> }).cache.values())].map(
          (r) => r.id,
        );
      }
    }
    if (!ids.some((id) => roles.has(id))) {
      await interaction.reply({ content: "Bạn không có quyền xác nhận.", ephemeral: true });
      return true;
    }
  }
  const by = interaction.user.username;
  const now = new Date().toISOString();
  if (action === "cancel") {
    await setVerifyFields(valkey, id, { status: "cancelled", verdictBy: by, decidedAt: now });
    await interaction.update({ components: [] });
    return true;
  }
  if (action !== "yes" && action !== "no") return true;
  await setVerifyFields(valkey, id, { status: action, verdictBy: by, decidedAt: now });
  const done = new EmbedBuilder()
    .setColor(action === "yes" ? 0x2ecc71 : 0xe74c3c)
    .setTitle(action === "yes" ? "✅ ĐÃ XÁC NHẬN ĐÚNG" : "❌ ĐÃ BÁC BỎ")
    .setDescription(rec.question.slice(0, 2000))
    .setFooter({ text: `Người xác nhận: ${by}` })
    .setTimestamp();
  await interaction.update({ embeds: [done], components: [] });
  return true;
}

let _valkey: Redis | null = null;

function getVerifyValkey(): Redis {
  if (!_valkey) {
    const env = getEnv();
    _valkey = new Redis({
      host: env.VALKEY_HOST,
      port: env.VALKEY_PORT,
      password: env.VALKEY_PASSWORD || undefined,
      username: env.VALKEY_USER || undefined,
      maxRetriesPerRequest: null,
    });
  }
  return _valkey;
}

let _remindersStarted = false;

function startReminders(client: Client): void {
  if (_remindersStarted) return;
  _remindersStarted = true;
  const env = getEnv();
  const tick = async () => {
    try {
      const valkey = getVerifyValkey();
      let cursor = "0";
      do {
        const [next, keys] = await valkey.scan(cursor, "MATCH", "vf:*", "COUNT", 100);
        cursor = next;
        for (const key of keys) {
          const id = key.slice(3);
          const rec: VerifyRecord | null = await loadVerify(valkey, id);
          if (!rec || rec.status !== "pending") continue;
          if (rec.reminds >= env.VERIFY_MAX_REMIND) continue;
          const age = Date.now() - Date.parse(rec.lastRemind || new Date().toISOString());
          if (age < env.VERIFY_REMIND_SEC * 1000) continue;
          const channel = await resolveChannel(client, rec.channelId);
          if (!channel) continue;
          await channel.send(`⏳ Nhắc xác nhận (${rec.reminds + 1}): ${rec.question.slice(0, 500)}`);
          await setVerifyFields(valkey, id, {
            reminds: String(rec.reminds + 1),
            lastRemind: new Date().toISOString(),
          });
        }
      } while (cursor !== "0");
    } catch (err) {
      console.error("[Discord] reminder tick failed:", err);
    }
  };
  setInterval(tick, 60_000).unref();
}

/** Chạy MCP stdio chung process bot — stdout giữ sạch cho protocol. */
export async function startDiscordMcp(client: Client): Promise<void> {
  const server = createDiscordMcpServer(client, getVerifyValkey());
  startReminders(client);
  await server.connect(new StdioServerTransport());
  console.error("[Discord] MCP stdio ready");
}

function httpTokens(): Set<string> {
  return new Set(
    getEnv()
      .MCP_HTTP_TOKENS.split(";")
      .map((s: string) => s.trim())
      .filter(Boolean),
  );
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk.toString();
      if (raw.length > 512 * 1024) {
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

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

/** HTTP transport cho container — POST /mcp (Bearer) + GET /health. */
export async function startDiscordMcpHttp(client: Client): Promise<void> {
  const env = getEnv();
  startReminders(client);
  const tokens = httpTokens();
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        sendJson(res, 200, { status: "ok", service: "discord-mcp" });
        return;
      }
      if (req.method !== "POST" || req.url !== "/mcp") {
        sendJson(res, 404, { error: "Not found" });
        return;
      }
      if (tokens.size > 0) {
        const auth = req.headers.authorization ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!tokens.has(token)) {
          sendJson(res, 401, { error: "Unauthorized" });
          return;
        }
      }
      const body = await readJson(req);
      const mcp = createDiscordMcpServer(client, getVerifyValkey());
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      console.error("[Discord] MCP http failed:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "MCP failed" });
      else res.end();
    }
  });
  await new Promise<void>((resolve) =>
    server.listen(env.MCP_HTTP_PORT, env.MCP_HTTP_HOST, resolve),
  );
  console.error(
    `[Discord] MCP http on ${env.MCP_HTTP_HOST}:${env.MCP_HTTP_PORT}`,
  );
}
