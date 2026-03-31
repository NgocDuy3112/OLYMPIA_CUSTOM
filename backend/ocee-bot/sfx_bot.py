"""Discord SFX Bot — plays sound effects on game events.

Listens to Valkey pub/sub for game events and plays short
sound effects (buzzer, timer, correct/wrong answer, etc.)
in the configured voice channel.
"""

import asyncio
import logging
import os
import sys

import discord
from discord.ext import commands

import configs
from valkey_listener import get_valkey_client, subscribe_to_match_channels

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, configs.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("sfx-bot")

# ── Bot Setup ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.voice_states = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Map of event type → SFX file (without extension)
EVENT_SFX_MAP = {
    "answer": "correct",          # Default answer sound
    "buzz": "buzzer",             # Buzzer press
    "start_the_timer": "timer_start",
    "timer_end": "timer_end",     # Timer expired
    "buzzer_winner": "winner",    # Winner celebration
    "navigate": "navigate",       # Page navigation
    "player_online": "join",      # Player joined
    "clear_answers": "clear",     # Answers cleared
}

# Queue for sequential SFX playback
_sfx_queue: asyncio.Queue[str] = asyncio.Queue()
_is_playing = False


def _find_sfx_file(event_type: str) -> str | None:
    """Find the SFX file for an event type."""
    base_name = EVENT_SFX_MAP.get(event_type)
    if not base_name:
        return None
    for ext in (".mp3", ".ogg", ".wav"):
        path = os.path.join(configs.SFX_DIR, f"{base_name}{ext}")
        if os.path.isfile(path):
            return path
    logger.debug(f"No SFX file found for event '{event_type}'")
    return None


async def _play_sfx(file_path: str) -> None:
    """Play a sound effect in the configured voice channel."""
    global _is_playing

    voice_channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
    if not voice_channel or not isinstance(voice_channel, discord.VoiceChannel):
        logger.warning("No valid voice channel configured")
        return

    try:
        vc = await voice_channel.connect()
    except discord.ClientException:
        vc = bot.guilds[0].voice_client if bot.guilds else None

    if not vc:
        return

    # Wait if something is already playing
    while _is_playing:
        await asyncio.sleep(0.1)

    _is_playing = True
    source = discord.FFmpegPCMAudio(file_path)
    vc.play(source, after=lambda e: setattr(sys.modules[__name__], "_is_playing", False))
    logger.info(f"Playing SFX: {os.path.basename(file_path)}")

    # Wait for playback to finish
    while vc.is_playing():
        await asyncio.sleep(0.1)

    _is_playing = False


async def _sfx_player():
    """Background task that processes the SFX queue."""
    while True:
        file_path = await _sfx_queue.get()
        try:
            await _play_sfx(file_path)
        except Exception as e:
            logger.error(f"Error playing SFX: {e}")
        finally:
            _sfx_queue.task_done()


# ── Event Handlers ───────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    logger.info(f"SFX Bot logged in as {bot.user}")

    # Start SFX player queue processor
    asyncio.create_task(_sfx_player())

    # Start Valkey listener
    asyncio.create_task(_valkey_listener())


async def _valkey_listener():
    """Listen to Valkey pub/sub for game events."""
    valkey_client = get_valkey_client()
    match_code = "OC3_M_VL"  # Default — discover from backend in production

    logger.info(f"SFX Bot listening to channel '{match_code}'")

    for message in subscribe_to_match_channels(valkey_client, match_code):
        msg_type = message.get("type", "")

        # Special handling for timer_end (triggered by frontend after timer expires)
        if msg_type == "start_the_timer":
            # Queue timer_end SFX to play after the timer duration
            time_limit = message.get("time_limit", 30)
            sfx_file = _find_sfx_file("timer_end")
            if sfx_file:
                await asyncio.sleep(time_limit)
                await _sfx_queue.put(sfx_file)

        # Queue SFX for other events
        sfx_file = _find_sfx_file(msg_type)
        if sfx_file:
            await _sfx_queue.put(sfx_file)


# ── Commands ─────────────────────────────────────────────────────────────────

@bot.command(name="sfx")
async def cmd_sfx(ctx: commands.Context, event: str):
    """Manually play a sound effect.

    Usage: !sfx buzzer
    Available: buzzer, correct, wrong, timer_end, winner, navigate, join
    """
    sfx_file = _find_sfx_file(event)
    if not sfx_file:
        await ctx.send(f"No SFX file found for '{event}'")
        return

    await _sfx_queue.put(sfx_file)
    await ctx.send(f"🔊 Queued: {event}")


@bot.command(name="queue")
async def cmd_queue(ctx: commands.Context):
    """Show current SFX queue length."""
    await ctx.send(f"📋 SFX queue: {_sfx_queue.qsize()} items")


@bot.command(name="clear")
async def cmd_clear(ctx: commands.Context):
    """Clear the SFX queue."""
    while not _sfx_queue.empty():
        try:
            _sfx_queue.get_nowait()
            _sfx_queue.task_done()
        except asyncio.QueueEmpty:
            break
    await ctx.send("🧹 SFX queue cleared")


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not configs.SFX_BOT_TOKEN:
        logger.error("SFX_BOT_TOKEN not set in .env")
        sys.exit(1)

    if not os.path.isdir(configs.SFX_DIR):
        os.makedirs(configs.SFX_DIR, exist_ok=True)
        logger.info(f"Created SFX directory: {configs.SFX_DIR}")

    bot.run(configs.SFX_BOT_TOKEN)
