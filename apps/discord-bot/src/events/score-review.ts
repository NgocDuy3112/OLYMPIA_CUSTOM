import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Client,
  type TextChannel,
} from "discord.js";

interface ReviewCandidate {
  user_code: string;
  label: string;
  answer_text: string;
}

interface ReviewRequest {
  review_id: string;
  match_code?: string;
  question_code?: string;
  question_content?: string;
  question_answer?: string;
  candidates: ReviewCandidate[];
}

interface ReviewState {
  request: ReviewRequest;
  decisions: Record<string, "dung" | "sai">;
  messageId?: string;
}

const states = new Map<string, ReviewState>();
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8000/api";

function shortLabel(label: string): string {
  return label.length > 20 ? label.slice(0, 19) + "…" : label;
}

function buildEmbed(state: ReviewState, oceeText?: string): EmbedBuilder {
  const { request, decisions } = state;
  const lines = request.candidates.map((c) => {
    const d = decisions[c.user_code];
    const mark = d === "dung" ? "✅" : d === "sai" ? "❌" : "⏳";
    return `${mark} **${c.label}**: ${c.answer_text || "(trống)"}`;
  });
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle("📝 DUYỆT ĐÁP ÁN")
    .setDescription(
      [
        `Mã câu hỏi: \`${request.question_code ?? ""}\``,
        `Nội dung: ${request.question_content ?? ""}`,
        `Đáp án gốc: **${request.question_answer ?? ""}**`,
        "",
        ...lines,
      ].join("\n"),
    )
    .setTimestamp();
  if (oceeText) {
    embed.addFields({ name: "🤖 OCee gợi ý (tham khảo)", value: oceeText.slice(0, 1000) });
  }
  return embed;
}

function buildRows(state: ReviewState): ActionRowBuilder<ButtonBuilder>[] {
  const { request, decisions } = state;
  const doneCount = request.candidates.filter((c) => decisions[c.user_code]).length;
  const allDone = doneCount === request.candidates.length;

  const dungRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    request.candidates.map((c) =>
      new ButtonBuilder()
        .setCustomId(`rv:${request.review_id}:dung:${c.user_code}`)
        .setLabel(`✔ ${shortLabel(c.label)}`)
        .setStyle(decisions[c.user_code] === "dung" ? ButtonStyle.Success : ButtonStyle.Secondary),
    ),
  );
  const saiRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    request.candidates.map((c) =>
      new ButtonBuilder()
        .setCustomId(`rv:${request.review_id}:sai:${c.user_code}`)
        .setLabel(`✘ ${shortLabel(c.label)}`)
        .setStyle(decisions[c.user_code] === "sai" ? ButtonStyle.Danger : ButtonStyle.Secondary),
    ),
  );
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rv:${request.review_id}:confirm`)
      .setLabel("Xác nhận")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!allDone),
    new ButtonBuilder()
      .setCustomId(`rv:${request.review_id}:ocee`)
      .setLabel("Nhờ OCee hỗ trợ")
      .setStyle(ButtonStyle.Secondary),
  );
  return [dungRow, saiRow, actionRow];
}

async function postDecision(reviewId: string, decisions: Record<string, string>, decidedBy: string) {
  const resp = await fetch(`${API_BASE}/score-reviews/${reviewId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decisions, decidedBy }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`Decision callback failed (${resp.status}): ${text.slice(0, 200)}`);
  }
}

export async function postScoreReview(
  client: Client,
  getChannel: () => TextChannel | null,
  request: ReviewRequest,
  channelId?: string,
): Promise<void> {
  const state: ReviewState = { request, decisions: {} };
  states.set(request.review_id, state);

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

  const msg = await channel.send({ embeds: [buildEmbed(state)], components: buildRows(state) });
  state.messageId = msg.id;
}

export async function handleReviewButton(interaction: ButtonInteraction): Promise<boolean> {
  const parts = interaction.customId.split(":");
  if (parts[0] !== "rv" || parts.length < 3) return false;
  const [, reviewId, action, userCode] = parts;
  const state = states.get(reviewId);
  if (!state) {
    await interaction.reply({ content: "Review đã hết hạn hoặc không tồn tại.", ephemeral: true });
    return true;
  }

  if (action === "dung" || action === "sai") {
    if (!userCode) return true;
    state.decisions[userCode] = action;
    await interaction.update({ embeds: [buildEmbed(state)], components: buildRows(state) });
    return true;
  }

  if (action === "ocee") {
    await interaction.deferUpdate();
    try {
      const resp = await fetch(`${API_BASE}/score-reviews/${reviewId}/ocee`, { method: "POST" });
      const json = (await resp.json()) as { data?: { text?: string }; message?: string };
      if (!resp.ok) throw new Error(json.message ?? "OCee failed");
      const text = json.data?.text ?? "";
      await interaction.editReply({ embeds: [buildEmbed(state, text)], components: buildRows(state) });
    } catch (err) {
      await interaction.followUp({
        content: err instanceof Error ? err.message : "OCee hỗ trợ thất bại.",
        ephemeral: true,
      });
    }
    return true;
  }

  if (action === "confirm") {
    const missing = state.request.candidates.filter((c) => !state.decisions[c.user_code]);
    if (missing.length > 0) {
      await interaction.reply({
        content: `Còn thiếu quyết định: ${missing.map((c) => c.label).join(", ")}`,
        ephemeral: true,
      });
      return true;
    }
    await interaction.deferUpdate();
    try {
      const decidedBy = interaction.user.username;
      await postDecision(reviewId, state.decisions, decidedBy);
      const done = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle("✅ ĐÃ DUYỆT")
        .setDescription(
          state.request.candidates
            .map((c) => `${state.decisions[c.user_code] === "dung" ? "✅" : "❌"} **${c.label}**`)
            .join("\n"),
        )
        .setFooter({ text: `Người duyệt: ${decidedBy}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [done], components: [] });
      states.delete(reviewId);
    } catch (err) {
      await interaction.followUp({
        content: err instanceof Error ? err.message : "Xác nhận thất bại.",
        ephemeral: true,
      });
    }
    return true;
  }

  return false;
}
