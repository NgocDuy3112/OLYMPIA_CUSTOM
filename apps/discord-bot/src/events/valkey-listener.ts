/**
 * Valkey pub/sub listener.
 *
 * Subscribes to match events and forwards notifications to Discord.
 */

import type Redis from "ioredis";
import type { Client, TextChannel } from "discord.js";
import { getEnv } from "../config/env.js";

const NOTIFICATION_TYPES = new Set([
  "round_start",
  "round_end",
  "game_end",
  "buzzer_winner",
  "navigate",
  "player_score_updated",
  "start_the_timer",
  "buzzer_activated",
  "vdr_turn_end",
  "vdr_round_end",
]);

const PHASE_NAMES: Record<string, string> = {
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
};

export function startValkeyListener(
  valkeySub: Redis,
  getChannel: () => TextChannel | null,
  client: Client,
) {
  const env = getEnv();
  const channel = env.MATCH_CODE;

  valkeySub.subscribe(`events:${channel}`, (err) => {
    if (err) {
      console.error(`Failed to subscribe to events:${channel}`, err);
    } else {
      console.log(`Subscribed to events:${channel}`);
    }
  });

  valkeySub.on("message", async (_ch, message) => {
    try {
      const data = JSON.parse(message);
      const msgType = data.type as string;
      await handleVdrVoice(client, data, msgType);

      if (!NOTIFICATION_TYPES.has(msgType)) return;

      const discordChannel = getChannel();
      if (!discordChannel) return;

      const embed = buildNotification(data, msgType);
      if (embed) {
        await discordChannel.send({ embeds: [embed] }).catch(() => {});
      }
    } catch {
      // ignore parse errors
    }
  });
}

async function handleVdrVoice(client: Client, data: Record<string, unknown>, msgType: string) {
  const env = getEnv();
  const guild = await client.guilds.fetch(env.DISCORD_GUILD_ID).catch(() => null);
  if (!guild) return;
  let mapping: Record<string, string> = {};
  try { mapping = JSON.parse(env.DISCORD_PLAYER_MAP) as Record<string, string>; } catch { return; }
  const members = await Promise.all(Object.values(mapping).map(id => guild.members.fetch(id).catch(() => null)));
  const restore = msgType === "buzzer_activated" || msgType === "vdr_turn_end" || msgType === "vdr_round_end" || msgType === "game_end" || (msgType === "navigate" && String(data.path ?? "").includes("/vdr/pick"));
  const selected = String(data.selected_player_code ?? "");
  await Promise.all(Object.entries(mapping).map(async ([code], index) => {
    const member = members[index];
    if (!member?.voice.channel) return;
    const focused = !restore && msgType === "start_the_timer" && data.phase === "vdr" && code === selected;
    await member.voice.setMute(!focused).catch(() => {});
    await member.voice.setDeaf(!focused).catch(() => {});
  }));
}

function buildNotification(data: Record<string, unknown>, msgType: string) {
  const { EmbedBuilder } = require("discord.js");
  const phase = data.phase as string | undefined;
  const phaseName = phase ? (PHASE_NAMES[phase] ?? phase) : "";

  switch (msgType) {
    case "round_start":
      return new EmbedBuilder()
        .setTitle(`🎬 Bắt đầu: ${phaseName}`)
        .setColor(0x00ff00)
        .setTimestamp();

    case "round_end":
      return new EmbedBuilder()
        .setTitle(`🏁 Kết thúc: ${phaseName}`)
        .setColor(0xff9900)
        .setTimestamp();

    case "game_end":
      return new EmbedBuilder()
        .setTitle("🏆 Trò chơi kết thúc!")
        .setColor(0xffd700)
        .setTimestamp();

    case "buzzer_winner":
      return new EmbedBuilder()
        .setTitle(`⚡ Buzzer`)
        .setDescription(`**${data.user_code}** đã buzz đúng!`)
        .setColor(0x00ffff)
        .setTimestamp();

    case "navigate":
      return new EmbedBuilder()
        .setTitle(`➡️ Di chuyển`)
        .setDescription(`Đi đến: \`${data.path}\``)
        .setColor(0x5865f2)
        .setTimestamp();

    default:
      return null;
  }
}
