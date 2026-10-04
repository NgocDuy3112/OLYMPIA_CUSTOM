
import {
  Client,
  GatewayIntentBits,
  Collection,
  Events,
  type TextChannel,
  type SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getEnv } from "./config/env.js";
import { pingCommand } from "./commands/ping.js";
import { createStatusCommand } from "./commands/status.js";
import { startValkeyListener } from "./events/valkey-listener.js";
import { handleReviewButton } from "./events/score-review.js";
import { handleVerifyButton } from "./mcp/server.js";
import { loginBot } from "./api-session.js";
import { startExecutor } from "./executor.js";
import { createValkeyClient } from "./valkey.js";
import { createLogger } from "./logger.js";

interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

const log = createLogger("bot");


async function createValkeyClients() {
  const makeClient = () =>
    createValkeyClient({
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 10) return null;
        return Math.min(times * 200, 5000);
      },
    });

  const client = makeClient();
  const subscriber = makeClient();

  await Promise.race([
    new Promise<void>((resolve) => client.once("ready", resolve)),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Valkey connection timeout")), 5000),
    ),
  ]);

  return { client, subscriber };
}

export async function startBot() {
  const env = getEnv();

  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
    ],
  });

  const commands = new Collection<string, Command>();
  commands.set(pingCommand.data.name, pingCommand as Command);

  const { client: valkey, subscriber: valkeySub } = await createValkeyClients();

  const statusCmd = createStatusCommand(valkey);
  commands.set(statusCmd.data.name, statusCmd as Command);

  discordClient.once(Events.ClientReady, (c) => {
    log.info(`✅ Logged in as ${c.user.tag}`);

    c.application.commands
      .set(commands.map((cmd) => cmd.data.toJSON()))
      .then(() => {
        log.info("✅ Slash commands registered");
      })
      .catch((err) => log.error(err));

    const getChannel = () => {
      return (
        (discordClient.channels.cache.get(
          env.NOTIFICATION_CHANNEL_ID,
        ) as TextChannel) ?? null
      );
    };
    startValkeyListener(valkeySub, getChannel, discordClient);
  });

  discordClient.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton()) {
      try {
        if (await handleVerifyButton(interaction)) return;
        const handled = await handleReviewButton(interaction);
        if (!handled) {
          await interaction.reply({ content: "Nút không còn hiệu lực.", ephemeral: true });
        }
      } catch (err) {
        log.error("Review button failed:", err);
      }
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      log.error(`Command ${interaction.commandName} failed:`, err);
      const reply = { content: "❌ Command failed", ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  });

  await discordClient.login(env.BOT_TOKEN);

  try {
    await loginBot();
    log.info("[Discord] API session ready");
  } catch (err) {
    log.error(
      "[Discord] API session failed (callbacks sẽ 403):",
      err instanceof Error ? err.message : err,
    );
  }

  const executor = startExecutor(discordClient);

  const shutdown = () => {
    log.info("Shutting down bot...");
    executor.close();
    valkeySub.disconnect();
    valkey.disconnect();
    discordClient.destroy();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return discordClient;
}
