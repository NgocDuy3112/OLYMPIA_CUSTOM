import type { Client, TextChannel } from "discord.js";

export async function resolveChannel(
  client: Client,
  getChannel: (() => TextChannel | null) | null,
  channelId?: string,
): Promise<TextChannel | null> {
  if (channelId) {
    try {
      const fetched = await client.channels.fetch(channelId);
      if (fetched?.isTextBased()) return fetched as TextChannel;
    } catch {
      // fall through to the default channel
    }
  }
  return getChannel?.() ?? null;
}
