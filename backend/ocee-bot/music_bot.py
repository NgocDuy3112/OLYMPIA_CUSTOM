"""Discord Music Bot — plays background music per game phase.

Listens to Valkey pub/sub for game phase changes and plays
corresponding background music in the configured voice channel.
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
logger = logging.getLogger("music-bot")

# ── Bot Setup ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.voice_states = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Map of game phase → music file (without extension)
PHASE_MUSIC_MAP = {
    "kdc": "kdc",       # Khởi Động Chung
    "kdr": "kdr",       # Khởi Động Riêng
    "bp": "bp",         # Bứt Phá
    "vdc": "vdc",       # Về Đích Chung
    "vdr": "vdr",       # Về Đích Riêng
    "gm": "gm",         # Giải Mã
    "vl": "vl",         # Vòng Loại
}

# Track current playback per guild
_current_track: dict[int, str] = {}


def _find_music_file(phase: str) -> str | None:
    """Find the MP3 file for a game phase."""
    base_name = PHASE_MUSIC_MAP.get(phase.lower())
    if not base_name:
        return None
    for ext in (".mp3", ".ogg", ".wav"):
        path = os.path.join(configs.MUSIC_DIR, f"{base_name}{ext}")
        if os.path.isfile(path):
            return path
    logger.warning(f"No music file found for phase '{phase}'")
    return None


async def _play_music(guild: discord.Guild, file_path: str) -> None:
    """Play a music file in the guild's voice channel."""
    voice_channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
    if not voice_channel or not isinstance(voice_channel, discord.VoiceChannel):
        logger.warning("No valid voice channel configured")
        return

    try:
        vc = await voice_channel.connect()
    except discord.ClientException:
        # Already connected — get existing voice client
        vc = guild.voice_client

    if vc and vc.is_playing():
        vc.stop()

    source = discord.FFmpegPCMAudio(file_path)
    vc.play(source, after=lambda e: logger.error(f"Playback error: {e}") if e else None)
    logger.info(f"Playing music: {os.path.basename(file_path)}")


async def _stop_music(guild: discord.Guild) -> None:
    """Stop current music and disconnect."""
    vc = guild.voice_client
    if vc:
        if vc.is_playing():
            vc.stop()
        await vc.disconnect(force=True)
        logger.info("Stopped music and disconnected")


# ── Event Handlers ───────────────────────────────────────────────────────────

@bot.event
async def on_ready():
    logger.info(f"Music Bot logged in as {bot.user}")

    # Start Valkey listener in background
    asyncio.create_task(_valkey_listener())


async def _valkey_listener():
    """Listen to Valkey pub/sub for game phase events."""
    valkey_client = get_valkey_client()

    # Default match code — in production, discover from backend
    match_code = "OC3_M_VL"

    logger.info(f"Music Bot listening to channel '{match_code}'")

    for message in subscribe_to_match_channels(valkey_client, match_code):
        msg_type = message.get("type", "")

        # Detect phase change from navigate events
        if msg_type == "navigate":
            path = message.get("path", "")
            phase = _extract_phase_from_path(path)
            if phase:
                guild = bot.guilds[0] if bot.guilds else None
                if guild:
                    music_file = _find_music_file(phase)
                    if music_file:
                        await _play_music(guild, music_file)
                        _current_track[guild.id] = phase

        # Stop music on game end
        elif msg_type in ("game_end", "navigate") and message.get("path") == "/player/access":
            guild = bot.guilds[0] if bot.guilds else None
            if guild:
                await _stop_music(guild)
                _current_track.pop(guild.id, None)


def _extract_phase_from_path(path: str) -> str | None:
    """Extract game phase from a navigation path.

    Examples:
        /player/kdc/OC3_M001 → kdc
        /player/vdr/OC3_M001 → vdr
    """
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


# ── Commands ─────────────────────────────────────────────────────────────────

@bot.command(name="play")
async def cmd_play(ctx: commands.Context, phase: str):
    """Manually play music for a game phase.

    Usage: !play kdc
    """
    music_file = _find_music_file(phase)
    if not music_file:
        await ctx.send(f"No music file found for phase '{phase}'")
        return

    if ctx.guild:
        await _play_music(ctx.guild, music_file)
        _current_track[ctx.guild.id] = phase
        await ctx.send(f"🎵 Now playing: {phase.upper()}")


@bot.command(name="stop")
async def cmd_stop(ctx: commands.Context):
    """Stop current music."""
    if ctx.guild:
        await _stop_music(ctx.guild)
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


# ── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not configs.MUSIC_BOT_TOKEN:
        logger.error("MUSIC_BOT_TOKEN not set in .env")
        sys.exit(1)

    if not os.path.isdir(configs.MUSIC_DIR):
        os.makedirs(configs.MUSIC_DIR, exist_ok=True)
        logger.info(f"Created music directory: {configs.MUSIC_DIR}")

    bot.run(configs.MUSIC_BOT_TOKEN)
