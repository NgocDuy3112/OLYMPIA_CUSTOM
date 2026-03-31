"""Discord Chatbot — RAG-powered Q&A bot for OLYMPIA CUSTOM.

Listens to Discord messages and responds using the RAG pipeline
with context from the quiz game database.
"""

import asyncio
import logging
import sys

import discord
from discord.ext import commands

import configs
from rag import rag_query

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("chat-bot")

# ── Bot Setup ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.message_content = True
intents.guild_messages = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Track which channels the bot should respond in
ACTIVE_CHANNELS: set[int] = set()


@bot.event
async def on_ready():
    logger.info(f"ChatBot logged in as {bot.user}")


@bot.event
async def on_message(message: discord.Message):
    """Handle incoming messages."""
    # Ignore bot's own messages
    if message.author == bot.user:
        return

    # Only respond in active channels or to direct mentions
    if message.channel.id not in ACTIVE_CHANNELS:
        if bot.user not in message.mentions:
            return

    # Process command or natural language query
    if message.content.startswith("!"):
        await bot.process_commands(message)
    else:
        # RAG query
        query = message.content
        if bot.user in message.mentions:
            # Strip mention from query
            query = query.replace(f"<@{bot.user.id}>", "").strip()

        if query:
            async with message.channel.typing():
                try:
                    response = await rag_query(query)
                    # Discord message limit is 2000 chars
                    for chunk in _split_message(response, 1900):
                        await message.channel.send(chunk)
                except Exception as e:
                    logger.error(f"RAG query failed: {e}")
                    await message.channel.send("⚠️ Có lỗi xảy ra, vui lòng thử lại sau.")


def _split_message(text: str, max_length: int) -> list[str]:
    """Split a long message into chunks that fit Discord's limit."""
    if len(text) <= max_length:
        return [text]

    chunks = []
    while text:
        if len(text) <= max_length:
            chunks.append(text)
            break

        # Find last newline within limit
        split_at = text.rfind("\n", 0, max_length)
        if split_at == -1:
            split_at = max_length

        chunks.append(text[:split_at].strip())
        text = text[split_at:].strip()

    return chunks


# ── Commands ─────────────────────────────────────────────────────────────────

@bot.command(name="activate")
async def cmd_activate(ctx: commands.Context):
    """Activate the bot in this channel."""
    ACTIVE_CHANNELS.add(ctx.channel.id)
    await ctx.send("✅ Bot đã được kích hoạt trong kênh này.")


@bot.command(name="deactivate")
async def cmd_deactivate(ctx: commands.Context):
    """Deactivate the bot in this channel."""
    ACTIVE_CHANNELS.discard(ctx.channel.id)
    await ctx.send("⏹️ Bot đã ngừng hoạt động trong kênh này.")


@bot.command(name="help")
async def cmd_help(ctx: commands.Context):
    """Show available commands."""
    help_text = (
        "**🤖 Olympia Custom ChatBot**\n\n"
        "**Commands:**\n"
        "!activate — Kích hoạt bot trong kênh này\n"
        "!deactivate — Tắt bot trong kênh này\n"
        "!help — Hiển thị trợ giúp\n"
        "!reindex — Re-index dữ liệu vào vector DB (admin only)\n\n"
        "**Chat:** Nhắc đến bot (@OlympiaBot) hoặc nhắn trong kênh đã kích hoạt."
    )
    await ctx.send(help_text)


@bot.command(name="reindex")
async def cmd_reindex(ctx: commands.Context):
    """Re-index all questions and rules into the vector database."""
    await ctx.send("🔄 Đang re-index... (tính năng chưa khả dụng)")
    # TODO: Call indexer.reindex_all()


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not configs.CHATBOT_BOT_TOKEN:
        logger.error("CHATBOT_BOT_TOKEN not set in .env")
        sys.exit(1)

    bot.run(configs.CHATBOT_BOT_TOKEN)
