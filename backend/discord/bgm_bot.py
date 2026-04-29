"""Discord BGM Bot — plays background music and timer audio on game events.

Listens to Valkey pub/sub in a background thread so the Discord heartbeat
loop is never blocked.
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
logger = logging.getLogger("bgm-bot")

# ── Bot Setup ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.voice_states = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Map of game phase (from navigate path) → audio file basename
PHASE_MUSIC_MAP = {
    "kdc": "kdc",   # Khởi Động Chung
    "kdr": "kdr",   # Khởi Động Riêng
    "bp": "bp",     # Bứt Phá
    "vdc": "vdc",   # Về Đích Chung
    "vdr": "vdr",   # Về Đích Riêng
    "gm": "gm",     # Giải Mã
    "vl": "vl",     # Vòng Loại
}

# Map of timer duration (seconds) → audio file basename
TIMER_BGM_MAP: dict[int, str] = {
    10: "VL_10s",
}

_current_track: dict[int, str] = {}


# ── Audio file helpers ────────────────────────────────────────────────────────

def _find_file(basename: str) -> str | None:
    for ext in (".ogg", ".mp3", ".wav"):
        path = os.path.join(configs.MUSIC_DIR, f"{basename}{ext}")
        if os.path.isfile(path):
            return path
    return None


def _find_phase_file(phase: str) -> str | None:
    basename = PHASE_MUSIC_MAP.get(phase.lower())
    if not basename:
        return None
    path = _find_file(basename)
    if not path:
        logger.warning(f"No audio file found for phase '{phase}'")
    return path


def _find_timer_file(time_limit: int) -> str | None:
    basename = TIMER_BGM_MAP.get(time_limit)
    if not basename:
        return None
    path = _find_file(basename)
    if not path:
        logger.warning(f"No timer BGM found for {time_limit}s")
    return path


# ── Playback ──────────────────────────────────────────────────────────────────

async def _play(guild: discord.Guild, file_path: str) -> None:
    # Reuse existing voice client; reconnect if disconnected
    vc: discord.VoiceClient | None = guild.voice_client
    if not vc or not vc.is_connected():
        try:
            channel = await bot.fetch_channel(int(configs.VOICE_CHANNEL_ID))
            if not isinstance(channel, discord.VoiceChannel):
                logger.warning("VOICE_CHANNEL_ID is not a voice channel")
                return
            vc = await channel.connect()
        except Exception as e:
            logger.error(f"Cannot connect to voice channel: {e}")
            return

    if vc.is_playing():
        vc.stop()

    source = discord.FFmpegOpusAudio(file_path)
    vc.play(source, after=lambda e: logger.error(f"Playback error: {e}") if e else None)
    logger.info(f"Playing: {os.path.basename(file_path)}")


async def _stop(guild: discord.Guild) -> None:
    vc = guild.voice_client
    if vc:
        if vc.is_playing():
            vc.stop()
        await vc.disconnect(force=True)
        logger.info("Stopped and disconnected")


# ── Valkey event handler ──────────────────────────────────────────────────────

def _extract_phase(path: str) -> str | None:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


async def _handle_message(message: dict) -> None:
    """Handle a single Valkey event on the asyncio event loop."""
    msg_type = message.get("type", "")
    guild = bot.guilds[0] if bot.guilds else None
    if not guild:
        return

    if msg_type == "navigate":
        path = message.get("path", "")
        if path == "/player/access":
            await _stop(guild)
            _current_track.pop(guild.id, None)
        else:
            phase = _extract_phase(path)
            if phase:
                music_file = _find_phase_file(phase)
                if music_file:
                    await _play(guild, music_file)
                    _current_track[guild.id] = phase

    elif msg_type == "start_the_timer":
        time_limit = int(message.get("time_limit", 0))
        timer_file = _find_timer_file(time_limit)
        if timer_file:
            await _play(guild, timer_file)

    elif msg_type == "game_end":
        await _stop(guild)
        _current_track.pop(guild.id, None)


async def _valkey_listener() -> None:
    """Subscribe to Valkey pub/sub in a thread to avoid blocking the event loop."""
    valkey_client = get_valkey_client()
    match_code = configs.MATCH_CODE
    loop = asyncio.get_running_loop()
    logger.info(f"BGM Bot listening on channel '{match_code}'")

    def _sync_subscribe():
        for message in subscribe_to_match_channels(valkey_client, match_code):
            asyncio.run_coroutine_threadsafe(_handle_message(message), loop)

    await asyncio.to_thread(_sync_subscribe)


# ── Discord event handlers ────────────────────────────────────────────────────

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
    logger.info(f"BGM Bot logged in as {bot.user}")
    await _auto_join_voice()
    asyncio.create_task(_valkey_listener())


# ── Commands ─────────────────────────────────────────────────────────────────

@bot.command(name="play")
async def cmd_play(ctx: commands.Context, phase: str):
    """Manually play BGM for a game phase. Usage: !play vl"""
    music_file = _find_phase_file(phase)
    if not music_file:
        await ctx.send(f"No audio file found for phase '{phase}'")
        return
    if ctx.guild:
        await _play(ctx.guild, music_file)
        _current_track[ctx.guild.id] = phase
        await ctx.send(f"🎵 Now playing: {phase.upper()}")


@bot.command(name="stop")
async def cmd_stop(ctx: commands.Context):
    """Stop current music."""
    if ctx.guild:
        await _stop(ctx.guild)
        _current_track.pop(ctx.guild.id, None)
        await ctx.send("⏹️ Music stopped")


@bot.command(name="volume")
async def cmd_volume(ctx: commands.Context, volume: int):
    """Set music volume (0-100)."""
    vc = ctx.guild.voice_client if ctx.guild else None
    if vc and hasattr(vc.source, "volume"):
        vc.source.volume = volume / 100
        await ctx.send(f"🔊 Volume set to {volume}%")
    else:
        await ctx.send("Not playing anything right now")


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not configs.BGM_BOT_TOKEN:
        logger.error("BGM_BOT_TOKEN not set in .env")
        sys.exit(1)

    os.makedirs(configs.MUSIC_DIR, exist_ok=True)
    bot.run(configs.BGM_BOT_TOKEN)
