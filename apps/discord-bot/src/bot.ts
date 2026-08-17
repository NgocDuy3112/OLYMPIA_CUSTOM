/**
 * Discord bot setup — client, commands, events.
 */

import {
  Client, GatewayIntentBits, Collection, Events,
  type TextChannel, type SlashCommandBuilder, type ChatInputCommandInteraction,
} from 'discord.js'
import Redis from 'ioredis'
import { getEnv } from './config/env.js'
import { pingCommand } from './commands/ping.js'
import { createStatusCommand } from './commands/status.js'
import { startValkeyListener } from './events/valkey-listener.js'

interface Command {
  data: SlashCommandBuilder
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>
}

// ── Shared async factory ──

async function createValkeyClients() {
  const env = getEnv()
  const opts = {
    host: env.VALKEY_HOST,
    port: env.VALKEY_PORT,
    password: env.VALKEY_PASSWORD || undefined,
    username: env.VALKEY_USER || undefined,
  }

  const makeClient = () => new Redis({
    ...opts,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      if (times > 10) return null
      return Math.min(times * 200, 5000)
    },
  })

  const client = makeClient()
  const subscriber = makeClient()

  await Promise.race([
    new Promise<void>((resolve) => client.once('ready', resolve)),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Valkey connection timeout')), 5000),
    ),
  ])

  return { client, subscriber }
}

export async function startBot() {
  const env = getEnv()

  const discordClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  })

  const commands = new Collection<string, Command>()
  commands.set(pingCommand.data.name, pingCommand as Command)

  // ── Valkey ──
  const { client: valkey, subscriber: valkeySub } = await createValkeyClients()

  const statusCmd = createStatusCommand(valkey)
  commands.set(statusCmd.data.name, statusCmd as Command)

  // ── Events ──
  discordClient.once(Events.ClientReady, (c) => {
    console.log(`✅ Logged in as ${c.user.tag}`)

    c.application.commands.set(
      commands.map((cmd) => cmd.data.toJSON()),
    ).then(() => {
      console.log('✅ Slash commands registered')
    }).catch(console.error)

    const getChannel = () => {
      return (discordClient.channels.cache.get(env.NOTIFICATION_CHANNEL_ID) as TextChannel) ?? null
    }
    startValkeyListener(valkeySub, getChannel)
  })

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return
    const command = commands.get(interaction.commandName)
    if (!command) return

    try {
      await command.execute(interaction)
    } catch (err) {
      console.error(`Command ${interaction.commandName} failed:`, err)
      const reply = { content: '❌ Command failed', ephemeral: true }
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply)
      } else {
        await interaction.reply(reply)
      }
    }
  })

  await discordClient.login(env.BOT_TOKEN)

  const shutdown = () => {
    console.log('Shutting down bot...')
    valkeySub.disconnect()
    valkey.disconnect()
    discordClient.destroy()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  return discordClient
}
