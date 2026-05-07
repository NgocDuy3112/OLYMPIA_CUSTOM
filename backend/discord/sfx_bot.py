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
import s3_audio
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
    "qualifier_scores_updated": "vl_cong_diem",
    "VL_10s": "VL_10s",
    "VL_cong_diem": "vl_cong_diem",
    "big_correct": "big_correct",
    "big_wrong": "big_wrong",
    "wrong": "wrong",
    "kd_cong_diem": "kd_cong_diem",
    "bp_dung": "bp_dung",
}

# Phase-specific overrides: { phase: { event_type: sfx_basename } }
PHASE_EVENT_SFX_MAP: dict[str, dict[str, str]] = {
    "gm": {
        "send_answers_to_players": "gm_mo_dap_an",
    },
    "bp": {
        "send_answers_to_players": "bp_mo_dap_an",
    },
    "kdc": {
        "send_answers_to_players": "kd_mo_dap_an",
    },
    "vdr": {
        "answering_window_activated": "vd_5s",
    },
}

_current_phase: str = ""

# Queue for sequential SFX playback
_sfx_queue: asyncio.Queue[str] = asyncio.Queue()
_is_playing = False


def _find_sfx_file(event_type: str) -> str | None:
    """Find the SFX file for an event type."""
    base_name = EVENT_SFX_MAP.get(event_type)
    if not base_name:
        return None
    if not os.path.isdir(configs.SFX_DIR):
        return None
    for filename in os.listdir(configs.SFX_DIR):
        name, ext = os.path.splitext(filename)
        if name.lower() == base_name.lower() and ext.lower() in (".mp3", ".ogg", ".wav"):
            return os.path.join(configs.SFX_DIR, filename)
    logger.debug(f"No SFX file found for event '{event_type}'")
    return None


async def _get_voice_client() -> discord.VoiceClient | None:
    """Return the existing voice client, or connect if not already in channel."""
    # Prefer already-connected voice client
    vc: discord.VoiceClient | None = bot.guilds[0].voice_client if bot.guilds else None
    if vc and vc.is_connected():
        return vc
    # Reconnect if disconnected
    try:
        channel = await bot.fetch_channel(int(configs.VOICE_CHANNEL_ID))
        if isinstance(channel, discord.VoiceChannel):
            return await channel.connect()
    except Exception as e:
        logger.warning(f"Cannot get voice client: {e}")
    return None


async def _play_sfx(file_path: str) -> None:
    """Play a sound effect in the configured voice channel."""
    global _is_playing

    vc = await _get_voice_client()
    if not vc:
        return

    # Wait if something is already playing
    while _is_playing:
        await asyncio.sleep(0.1)

    _is_playing = True
    try:
        source = discord.FFmpegOpusAudio(file_path)
    except Exception as e:
        logger.error(f"Failed to create audio source for '{file_path}': {e}")
        _is_playing = False
        return
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

async def _auto_join_voice() -> None:
    """Join the configured voice channel on startup."""
    if not configs.VOICE_CHANNEL_ID:
        logger.warning("VOICE_CHANNEL_ID not set — skipping auto-join")
        return
    try:
        channel = await bot.fetch_channel(int(configs.VOICE_CHANNEL_ID))
        if not isinstance(channel, discord.VoiceChannel):
            logger.warning(f"Channel {configs.VOICE_CHANNEL_ID} is not a voice channel")
            return
        guild = channel.guild
        if guild.voice_client:
            logger.info("Already in a voice channel")
            return
        await channel.connect()
        logger.info(f"Auto-joined voice channel: {channel.name} ({guild.name})")
    except Exception as e:
        logger.warning(f"Auto-join failed: {e}")


@bot.event
async def on_ready():
    logger.info(f"SFX Bot logged in as {bot.user}")
    await asyncio.to_thread(s3_audio.sync_audio_from_s3)
    await _auto_join_voice()
    asyncio.create_task(_sfx_player())
    asyncio.create_task(_valkey_listener())


def _extract_phase(path: str) -> str | None:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


async def _handle_message(message: dict) -> None:
    """Dispatch a single Valkey message to the SFX queue (runs on the event loop)."""
    global _current_phase
    msg_type = message.get("type", "")
    logger.debug(f"Received event: type={msg_type!r} keys={list(message.keys())}")

    # Track current game phase from navigate events
    if msg_type == "navigate":
        phase = _extract_phase(message.get("path", ""))
        if phase:
            _current_phase = phase

    # Queue timer_end SFX after the timer duration elapses
    if msg_type == "start_the_timer":
        if not _current_phase:
            _current_phase = message.get("phase", "")
        time_limit = int(message.get("time_limit", 30))
        sfx_file = _find_sfx_file("timer_end")
        if sfx_file:
            await asyncio.sleep(time_limit)
            await _sfx_queue.put(sfx_file)

    # Resolve SFX: phase-specific override takes priority over generic map
    phase_override = PHASE_EVENT_SFX_MAP.get(_current_phase, {}).get(msg_type)
    if phase_override:
        for ext in (".mp3", ".ogg", ".wav"):
            path = os.path.join(configs.SFX_DIR, f"{phase_override}{ext}")
            if os.path.isfile(path):
                await _sfx_queue.put(path)
                break
    else:
        sfx_file = _find_sfx_file(msg_type)
        if sfx_file:
            await _sfx_queue.put(sfx_file)


async def _valkey_listener():
    """Listen to Valkey pub/sub for game events.

    Runs the blocking subscriber in a thread so it never stalls the Discord
    heartbeat loop. Each message is dispatched back to the event loop via
    run_coroutine_threadsafe.
    """
    valkey_client = get_valkey_client()
    match_code = configs.MATCH_CODE
    loop = asyncio.get_running_loop()
    logger.info(f"SFX Bot listening to channel '{match_code}'")

    def _on_done(fut: asyncio.Future) -> None:
        if not fut.cancelled() and fut.exception():
            logger.error(f"Message handler error: {fut.exception()}")

    def _sync_subscribe():
        for message in subscribe_to_match_channels(valkey_client, match_code):
            fut = asyncio.run_coroutine_threadsafe(_handle_message(message), loop)
            fut.add_done_callback(_on_done)

    await asyncio.to_thread(_sync_subscribe)


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

    bot.run(configs.SFX_BOT_TOKEN)
