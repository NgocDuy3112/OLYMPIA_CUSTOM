import { Client, EmbedBuilder, TextChannel } from "discord.js";
import type Redis from "ioredis";
import { postScoreReview } from "./score-review.js";

const VALKEY_CHANNEL = "oc:live-events";

interface LiveEvent {
  type: string;
  match_code?: string;
  match_name?: string;
  tournament_code?: string;
  channel_id?: string;
  starts_at?: string;
  player_name?: string;
  player_code?: string;
  player_count?: number;
  max_players?: number;
  question_code?: string;
  old_score?: number;
  new_score?: number;
  score?: number;
  scoreboard?: Array<{
    userCode: string;
    userName: string;
    score: number;
  }>;
  phase?: string;
  round_number?: number;
  round_name?: string;
  total_rounds?: number;
  match_status?: string;
  players?: Array<string | { discord_user_id?: string; nickname?: string }>;
  duration?: number;
}

type EmbedHandler = (event: LiveEvent) => EmbedBuilder | null;

// ── Phase Names ─────────────────────────────────────────────────────────────

const PHASE_NAMES: Record<string, string> = {
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
  waiting: "Sảnh Chờ",
};

const RANK_EMOJI = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

// ── Embed Builders ──────────────────────────────────────────────────────────

// Match Events
const matchStarted: EmbedHandler = (e) => {
  if (!e.match_code) return null;
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("🟢 TRẬN ĐẤU BẮT ĐẦU")
    .setDescription(`**${e.match_name || e.match_code}**`)
    .setTimestamp();
};

const matchFinished: EmbedHandler = (e) => {
  if (!e.match_code) return null;
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("🏁 TRẬN ĐẤU KẾT THÚC")
    .setDescription(`**${e.match_name || e.match_code}**`)
    .setTimestamp();
};

// Player Events
const playerJoined: EmbedHandler = (e) => {
  if (!e.player_name) return null;
  const playerCount = e.player_count ? ` (${e.player_count}/${e.max_players || "?"})` : "";
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("👋 THÍ SINH VÀO PHÒNG")
    .setDescription(`**${e.player_name}** đã tham gia${playerCount}`)
    .setTimestamp();
};

const playerLeft: EmbedHandler = (e) => {
  if (!e.player_name) return null;
  return new EmbedBuilder()
    .setColor(0x95a5a6)
    .setTitle("👋 THÍ SINH RỜI PHÒNG")
    .setDescription(`**${e.player_name}** đã rời đi`)
    .setTimestamp();
};

const playersReady: EmbedHandler = (e) => {
  if (!e.players || e.players.length === 0) return null;
  const playerList = e.players
    .map((p) => (typeof p === "string" ? p : (p.nickname ?? p.discord_user_id ?? "?")))
    .map((p) => `🟢 ${p}`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle("✅ ĐỦ THÍ SINH")
    .setDescription(`**${e.players.length} thí sinh** đã sẵn sàng!`)
    .addFields({ name: "Thí sinh", value: playerList })
    .setTimestamp();
};

// Prematch notify — fire-and-forget from API via Valkey.
// channel_id is resolved per tournament (Discord IDs are global snowflakes).
const prematchNotify: EmbedHandler = (e) => {
  if (!e.players || e.players.length === 0) return null;
  const mentions = e.players
    .map((p) =>
      typeof p === "string"
        ? p
        : p.discord_user_id
          ? `<@${p.discord_user_id}>`
          : (p.nickname ?? "?"),
    )
    .join(" ");
  return new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle("⏰ CHUẨN BỊ VÀO TRẬN")
    .setDescription(
      `**${e.match_code ?? e.tournament_code ?? ""}**${e.starts_at ? ` — bắt đầu lúc ${e.starts_at}` : ""}\n${mentions}`,
    )
    .setTimestamp();
};

// Round Events
const roundStarted: EmbedHandler = (e) => {
  const roundName = e.round_name || `Round ${e.round_number || "?"}`;
  const phaseName = e.phase ? PHASE_NAMES[e.phase] || e.phase : "";
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("🎬 VÒNG THI BẮT ĐẦU")
    .setDescription(`**${roundName}**${phaseName ? ` - ${phaseName}` : ""}`)
    .setTimestamp();
};

const roundEnded: EmbedHandler = (e) => {
  const roundName = e.round_name || `Round ${e.round_number || "?"}`;
  return new EmbedBuilder()
    .setColor(0x8e44ad)
    .setTitle("⏹️ VÒNG THI KẾT THÚC")
    .setDescription(`**${roundName}** đã hoàn thành`)
    .setTimestamp();
};

// Score Events
const scoreUpdated: EmbedHandler = (e) => {
  if (!e.player_name || e.new_score == null) return null;
  const change = e.old_score != null ? e.new_score - e.old_score : 0;
  const sign = change >= 0 ? "+" : "";
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("📊 CẬP NHẬT ĐIỂM SỐ")
    .setDescription(`**${e.player_name}**: ${sign}${change} điểm`)
    .addFields({
      name: "Tổng điểm",
      value: `${e.score ?? e.new_score}`,
      inline: true,
    })
    .setTimestamp();
};

const scoreboardUpdated: EmbedHandler = (e) => {
  if (!e.scoreboard || e.scoreboard.length === 0) return null;
  const sorted = [...e.scoreboard].sort((a, b) => b.score - a.score);
  const lines = sorted.slice(0, 8).map((p, i) => {
    const emoji = RANK_EMOJI[i] || `${i + 1}.`;
    return `${emoji} **${p.userName}** - ${p.score} điểm`;
  });
  return new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle("📊 BẢNG ĐIỂM SỐ")
    .setDescription(lines.join("\n"))
    .setTimestamp();
};

// Phase Events
const phaseChanged: EmbedHandler = (e) => {
  if (!e.phase) return null;
  const phaseName = PHASE_NAMES[e.phase] || e.phase;
  return new EmbedBuilder()
    .setColor(0x2980b9)
    .setTitle("🔄 CHUYỂN VÒNG")
    .setDescription(`Bắt đầu: **${phaseName}**`)
    .setTimestamp();
};

// ── Handler Registry ────────────────────────────────────────────────────────

const handlers: Record<string, EmbedHandler> = {
  // Match lifecycle
  match_started: matchStarted,
  match_opened: matchStarted,
  match_finished: matchFinished,
  match_ended: matchFinished,
  match_state: (e) => {
    if (e.match_status === "open") return matchStarted(e);
    if (e.match_status === "finished") return matchFinished(e);
    return null;
  },

  // Player events
  player_joined: playerJoined,
  user_online: playerJoined,
  player_left: playerLeft,
  player_offline: playerLeft,
  players_ready: playersReady,
  introduce_players: playersReady,

  // Round events
  round_started: roundStarted,
  round_end: roundEnded,

  // Score events
  player_scored: scoreUpdated,
  player_score_updated: scoreUpdated,
  show_scoreboard: scoreboardUpdated,

  // Phase events
  phase_changed: phaseChanged,
  round_start: roundStarted,

  // Prematch notify (fire-and-forget from API)
  prematch_notify: prematchNotify,
};

// ── Event Processing ────────────────────────────────────────────────────────

function buildEmbed(event: LiveEvent): EmbedBuilder | null {
  const handler = handlers[event.type];
  return handler ? handler(event) : null;
}

async function sendEmbed(
  client: Client,
  getChannel: () => TextChannel | null,
  embed: EmbedBuilder,
  channelId?: string,
) {
  // Per-tournament channel first (Discord IDs are global snowflakes),
  // fall back to the shared notification channel from env.
  let channel: TextChannel | null = null;
  if (channelId) {
    try {
      const fetched = await client.channels.fetch(channelId);
      if (fetched?.isTextBased()) channel = fetched as TextChannel;
    } catch {
      channel = null;
    }
  }
  channel ??= getChannel();
  if (!channel) return;

  try {
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("[Discord] Failed to send embed:", error);
  }
}

// ── Main Listener ───────────────────────────────────────────────────────────

export function startValkeyListener(
  subscriber: Redis,
  getChannel: () => TextChannel | null,
  client: Client,
) {
  void subscriber.subscribe(VALKEY_CHANNEL, (err) => {
    if (err) {
      console.error("[Discord] Subscribe error:", err);
      return;
    }
    console.log(`[Discord] Subscribed to ${VALKEY_CHANNEL}`);
  });

  subscriber.on("message", (_channel: string, message: string) => {
    try {
      const event = JSON.parse(message) as LiveEvent & {
        review_id?: string;
        question_content?: string;
        question_answer?: string;
        candidates?: Array<{ user_code: string; label: string; answer_text: string }>;
      };
      if (event.type === "score_review_request" && event.review_id) {
        void postScoreReview(
          client,
          getChannel,
          {
            review_id: event.review_id,
            match_code: event.match_code,
            question_code: event.question_code,
            question_content: event.question_content,
            question_answer: event.question_answer,
            candidates: event.candidates ?? [],
          },
          event.channel_id,
        );
        return;
      }
      // score_review_decided / score_review_ocee are informational;
      // the interactive message already updates via button handlers.
      if (event.type === "score_review_decided" || event.type === "score_review_ocee") return;
      const embed = buildEmbed(event);

      if (embed) {
        void sendEmbed(client, getChannel, embed, event.channel_id);
      }
    } catch (error) {
      console.error("[Discord] Failed to process event:", error);
    }
  });
}
