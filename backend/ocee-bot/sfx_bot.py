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
    # Qualifier-specific mappings
    "qualifier_scores_updated": "VL_10s",
    "VL_10s": "VL_10s",
    "VL_cong_diem": "VL_cong_diem",
    "big_correct": "big_correct",
    "big_wrong": "big_wrong",
    "wrong": "wrong",
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
    global _is_playing, _vc

    # Reconnect if vc was lost
    if not _vc or not _vc.is_connected():
        voice_channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
        if not voice_channel or not isinstance(voice_channel, discord.VoiceChannel):
            logger.warning("No valid voice channel configured")
            return
        try:
            _vc = await voice_channel.connect()
        except discord.ClientException:
            _vc = bot.guilds[0].voice_client if bot.guilds else None

    vc = _vc
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

# Shared voice client reused across all SFX plays
_vc: discord.VoiceClient | None = None


@bot.event
async def on_ready():
    global _vc
    logger.info(f"SFX Bot logged in as {bot.user}")

    # Join voice channel on startup
    voice_channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
    if voice_channel and isinstance(voice_channel, discord.VoiceChannel):
        try:
            _vc = await voice_channel.connect()
            logger.info(f"SFX Bot joined voice channel: {voice_channel.name}")
        except discord.ClientException:
            _vc = bot.guilds[0].voice_client if bot.guilds else None
            logger.info("SFX Bot already in voice channel")
    else:
        logger.warning(f"VOICE_CHANNEL_ID={configs.VOICE_CHANNEL_ID!r} not found or not a voice channel")

    # Start SFX player queue processor
    asyncio.create_task(_sfx_player())

    # Start Valkey listener
    asyncio.create_task(_valkey_listener())


async def _valkey_listener():
    """Listen to Valkey pub/sub for game events (async, with auto-reconnect)."""
    import json
    from valkey.asyncio import Valkey as AsyncValkey

    match_code = configs.MATCH_CODE

    while True:
        vk: AsyncValkey | None = None
        try:
            vk = AsyncValkey(
                host=configs.VALKEY_HOST,
                port=configs.VALKEY_PORT,
                password=configs.VALKEY_PASSWORD,
                db=configs.VALKEY_DB,
                decode_responses=True,
                socket_timeout=None,
                socket_connect_timeout=10,
            )
            pubsub = vk.pubsub()
            await pubsub.subscribe(match_code)
            logger.info(f"SFX Bot subscribed to channel '{match_code}'")

            async for raw in pubsub.listen():
                if raw["type"] != "message":
                    continue
                try:
                    message = json.loads(raw["data"])
                except (json.JSONDecodeError, TypeError):
                    logger.warning(f"Invalid JSON on channel {match_code}: {raw['data']}")
                    continue

                msg_type = message.get("type", "")

                # Special handling for timer_end (triggered by frontend after timer expires)
                if msg_type == "start_the_timer":
                    # Queue timer_end SFX to play after the timer duration
                    time_limit = message.get("time_limit", 30)
                    sfx_file = _find_sfx_file("timer_end")
                    if sfx_file:
                        await asyncio.sleep(time_limit)
                        await _sfx_queue.put(sfx_file)
                    # continue processing other special events

                # Special handling for qualifier score updates
                if msg_type == "qualifier_scores_updated":
                    correct = int(message.get("correct_count", 0) or 0)
                    wrong = int(message.get("wrong_count", 0) or 0)

                    # Prefer the VL_cong_diem file (user-provided), fallback to applause/correct/wrong
                    sfx_file = _find_sfx_file("VL_cong_diem") or _find_sfx_file("applause") or _find_sfx_file("correct")
                    if not sfx_file:
                        if correct > wrong:
                            sfx_file = _find_sfx_file("correct")
                        elif wrong > correct:
                            sfx_file = _find_sfx_file("wrong") or _find_sfx_file("boo")
                        else:
                            sfx_file = _find_sfx_file("applause")

                    if sfx_file:
                        await _sfx_queue.put(sfx_file)

                    # Play special SFX for large deltas to highlight big swings
                    updates = message.get("score_updates", []) or []
                    for u in updates:
                        try:
                            delta = int(u.get("delta", 0) or 0)
                        except Exception:
                            delta = 0
                        if delta >= 10:
                            f = _find_sfx_file("big_correct")
                            if f:
                                await _sfx_queue.put(f)
                        elif delta <= -10:
                            f = _find_sfx_file("big_wrong")
                            if f:
                                await _sfx_queue.put(f)

                    # Don't fall through to the generic queueing for this event
                    continue

                # Queue SFX for other events
                sfx_file = _find_sfx_file(msg_type)
                if sfx_file:
                    await _sfx_queue.put(sfx_file)

        except Exception as e:
            logger.error(f"SFX Valkey listener crashed: {e} — reconnecting in 5 s")
        finally:
            if vk is not None:
                try:
                    await vk.aclose()
                except Exception:
                    pass

        await asyncio.sleep(5)


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
