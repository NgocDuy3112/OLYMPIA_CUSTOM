import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js'

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),

  async execute(interaction: ChatInputCommandInteraction) {
    const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true })
    const latency = sent.createdTimestamp - interaction.createdTimestamp
    await interaction.editReply(`🏓 Pong! Latency: ${latency}ms`)
  },
}
