import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  EmbedBuilder,
} from "discord.js";
import type Redis from "ioredis";

export function createStatusCommand(valkey: Redis) {
  return {
    data: new SlashCommandBuilder()
      .setName("status")
      .setDescription("Check match status"),

    async execute(interaction: ChatInputCommandInteraction) {
      await interaction.deferReply();

      const matchCode = interaction.options.getString("match") || "OC3_M_VL";

      // Check if match snapshot exists in Valkey
      const exists = await valkey.exists(`snapshot:${matchCode}`);

      const embed = new EmbedBuilder()
        .setTitle(`Match: ${matchCode}`)
        .setColor(exists ? 0x00ff00 : 0xff0000)
        .addFields(
          {
            name: "Status",
            value: exists ? "🟢 Active" : "🔴 Inactive",
            inline: true,
          },
          { name: "Valkey", value: "✅ Connected", inline: true },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    },
  };
}
