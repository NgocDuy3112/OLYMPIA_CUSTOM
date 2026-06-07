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
import s3_audio
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

# Map of game phase (from navigate path) → audio file basename played on navigation.
PHASE_MUSIC_MAP: dict[str, str] = {
    # Navigate intro do SFX bot đảm nhiệm — BGM chỉ phát timer music (start_the_timer)
}

# Phases whose timer files use a shorter prefix than the phase name.
# e.g. phase "vdc" → timer file "vd_30s.mp3" (not "vdc_30s.mp3")
_TIMER_PHASE_MAP = {
    "vdc": "vd",
    "vdr": "vd",
    # The Giải Mã keyword timer ships as `gm_15s.ogg` (not `gm_keyword_15s.*`),
    # so map the `phase: "gm_keyword"` flag sent by the admin to the literal
    # `gm` prefix. The admin currently broadcasts `start_the_timer` with
    # `phase: "gm_keyword"` instead of the legacy `start_keyword_timer` event.
    "gm_keyword": "gm",
}


_current_track: dict[int, str] = {}


# ── Audio file helpers ────────────────────────────────────────────────────────

def _find_file(basename: str) -> str | None:
    if not os.path.isdir(configs.BGM_DIR):
        return None
    for filename in os.listdir(configs.BGM_DIR):
        name, ext = os.path.splitext(filename)
        if name.lower() == basename.lower() and ext.lower() in (".ogg", ".mp3", ".wav"):
            return os.path.join(configs.BGM_DIR, filename)
    return None


def _find_phase_file(phase: str) -> str | None:
    basename = PHASE_MUSIC_MAP.get(phase.lower())
    if not basename:
        return None
    path = _find_file(basename)
    if not path:
        logger.warning(f"No audio file found for phase '{phase}'")
    return path


# ── Playback ──────────────────────────────────────────────────────────────────

async def _get_voice_client(guild: discord.Guild) -> discord.VoiceClient | None:
    """Return a usable voice client on `guild`, connecting if needed.

    Discord's gateway can hold an orphan voice session for 30-60s after
    the bot disconnects (or after a restart). During that window
    guild.voice_client reports None locally while Discord still rejects
    any new connect() with "Already connected". Retry with long backoff
    AND re-scan every guild's voice client — the session eventually
    shows up somewhere, even if not on the guild we expected.
    """
    # Fast path: live client already exists on our guild.
    vc = guild.voice_client
    if vc is not None and vc.is_connected():
        return vc

    # Slow path: clean up any stale client on this guild, then connect.
    stale = guild.voice_client
    if stale is not None:
        logger.warning(f"Voice client on '{guild.name}' is stale — cleaning up")
        try:
            await stale.disconnect(force=True)
        except Exception as e:
            logger.warning(f"Failed to disconnect stale client: {e}")

    # Locate the voice channel.
    channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
    if channel is None:
        try:
            channel = await bot.fetch_channel(int(configs.VOICE_CHANNEL_ID))
        except Exception as e:
            logger.error(f"Cannot resolve VOICE_CHANNEL_ID: {e}")
            return None
    if not isinstance(channel, discord.VoiceChannel):
        logger.warning("VOICE_CHANNEL_ID is not a voice channel")
        return None

    # Retry connect with long backoff. After each delay, scan EVERY
    # guild's voice client — the orphan session can pop up on any guild
    # Discord.py is tracking, not necessarily the one we asked for.
    delays = [5.0, 10.0, 20.0, 40.0]
    for attempt, delay in enumerate(delays, start=1):
        # Scan all guilds first (orphan session may live elsewhere).
        for g in bot.guilds:
            existing = g.voice_client
            if existing is not None and existing.is_connected():
                logger.info(
                    f"Found live voice client on '{g.name}' (attempt {attempt}) — reusing"
                )
                return existing

        try:
            return await channel.connect(self_deaf=True)
        except discord.ClientException as e:
            logger.warning(
                f"connect attempt {attempt}/{len(delays)} rejected ({e}); "
                f"re-scanning in {delay}s"
            )
            await asyncio.sleep(delay)
        except Exception as e:
            logger.error(f"connect attempt {attempt} failed: {e}")
            await asyncio.sleep(delay)

    logger.error("All connect attempts failed — aborting playback")
    return None


async def _play(guild: discord.Guild, file_path: str) -> None:
    logger.info(f"Attempting to play: {file_path}")

    # Check if file exists
    if not os.path.isfile(file_path):
        logger.error(f"Audio file not found: {file_path}")
        return

    vc = await _get_voice_client(guild)
    if vc is None:
        return

    if vc.is_playing():
        logger.info("Stopping current playback")
        vc.stop()

    try:
        source = discord.FFmpegOpusAudio(file_path)
    except Exception as e:
        logger.error(f"Failed to create audio source for '{file_path}': {e}")
        return
    try:
        vc.play(source)
        logger.info(f"Playing: {os.path.basename(file_path)}")
    except discord.ClientException as e:
        logger.error(f"vc.play() failed (voice state desync?): {e} — will force-reconnect next call")
        try:
            await vc.disconnect(force=True)
        except Exception:
            pass


# ── Background player (queue + lock) ──────────────────────────────────────────
# All play requests go through this queue so the bot serialises voice
# connect / cleanup / play. This matches the pattern in sfx_bot.py and
# ping_bot.py and prevents the "Already connected" race when multiple
# events arrive close together (e.g. back-to-back start_the_timer).
_bgm_queue: asyncio.Queue[tuple[discord.Guild, str]] = asyncio.Queue()


async def _bgm_player() -> None:
    """Background task: dequeue play requests and call _play serially."""
    logger.info("BGM background player started")
    while True:
        guild, file_path = await _bgm_queue.get()
        try:
            await _play(guild, file_path)
        except Exception as e:
            logger.error(f"Error in BGM background player: {e}")
        finally:
            _bgm_queue.task_done()


async def _stop(guild: discord.Guild) -> None:
    vc = guild.voice_client
    if vc and vc.is_playing():
        vc.stop()
        logger.info("Playback stopped")


# ── Valkey event handler ──────────────────────────────────────────────────────

def _extract_phase(path: str) -> str | None:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


async def _handle_message(message: dict) -> None:
    """Handle a single Valkey event on the asyncio event loop."""
    msg_type = message.get("type", "")
    logger.debug(f"Received event: type={msg_type!r} keys={list(message.keys())}")
    guild = bot.guilds[0] if bot.guilds else None
    if not guild:
        return

    if msg_type == "navigate":
        phase = _extract_phase(message.get("path", ""))
        if phase:
            _current_track[guild.id] = phase

    elif msg_type == "start_the_timer":
        logger.info(f"Received start_the_timer event: {message}")
        try:
            time_limit = int(message.get("time_limit") or 0)
        except (ValueError, TypeError):
            logger.warning(f"Invalid time_limit in start_the_timer: {message.get('time_limit')!r}")
            return
        current_phase = message.get("phase", "") or _current_track.get(guild.id, "")
        logger.info(f"Current phase: {current_phase}, time_limit: {time_limit}s")
        if current_phase:
            timer_prefix = _TIMER_PHASE_MAP.get(current_phase, current_phase)
            timer_file = _find_file(f"{timer_prefix}_{time_limit}s")
            if timer_file:
                logger.info(f"Found timer file: {timer_file}")
                await _bgm_queue.put((guild, timer_file))
            else:
                logger.warning(f"No timer BGM for phase='{current_phase}' time={time_limit}s (looked for '{timer_prefix}_{time_limit}s')")
                # List available files for debugging
                if os.path.isdir(configs.BGM_DIR):
                    available = os.listdir(configs.BGM_DIR)
                    logger.info(f"Available BGM files: {available}")
        else:
            logger.warning(f"start_the_timer: unknown phase, skipping (question_code={message.get('question_code')!r})")

    elif msg_type == "start_keyword_timer":
        # Keyword timer for Giải Mã round — always plays gm_15s.ogg
        logger.info(f"Received start_keyword_timer event: {message}")
        keyword_file = _find_file("gm_15s")
        if keyword_file:
            logger.info(f"Found keyword timer file: {keyword_file}")
            await _bgm_queue.put((guild, keyword_file))
        else:
            logger.warning("No keyword timer BGM found (looked for 'gm_15s')")

    elif msg_type == "play_bgm":
        phase = message.get("phase", "")
        if phase:
            _current_track[guild.id] = phase
            music_file = _find_phase_file(phase)
            if music_file:
                await _bgm_queue.put((guild, music_file))
            else:
                logger.warning(f"play_bgm: no audio file for phase '{phase}'")

    elif msg_type == "answering_window_activated":
        # Buzzer window 5s for Về Đích Riêng — only play in VDR phase
        current_phase = _current_track.get(guild.id, "")
        if current_phase != "vdr":
            logger.debug(f"answering_window_activated ignored in phase '{current_phase}' (only vdr)")
        else:
            buzzer_file = _find_file("vd_5s")
            if buzzer_file:
                await _bgm_queue.put((guild, buzzer_file))
            else:
                logger.warning("No audio file found for 'vd_5s'")

    elif msg_type == "vd_power_window_open":
        # Power selection window 5s for Về Đích (Chung + Riêng) — play in either phase
        current_phase = _current_track.get(guild.id, "")
        if current_phase not in ("vdc", "vdr"):
            logger.debug(f"vd_power_window_open ignored in phase '{current_phase}' (only vdc/vdr)")
        else:
            power_file = _find_file("vd_5s")
            if power_file:
                await _bgm_queue.put((guild, power_file))
            else:
                logger.warning("No audio file found for 'vd_5s' (power window)")

    elif msg_type == "game_end":
        await _stop(guild)
        _current_track.pop(guild.id, None)


async def _valkey_listener() -> None:
    """Subscribe to Valkey pub/sub in a thread to avoid blocking the event loop.

    Automatically reconnects with exponential backoff if the connection drops.
    """
    match_code = configs.MATCH_CODE
    loop = asyncio.get_running_loop()
    logger.info(f"BGM Bot listening on channel '{match_code}'")
    retry_delay = 2

    def _on_done(fut: asyncio.Future) -> None:
        if not fut.cancelled() and fut.exception():
            logger.error(f"Message handler error: {fut.exception()}")

    def _sync_subscribe():
        valkey_client = get_valkey_client()
        for message in subscribe_to_match_channels(valkey_client, match_code):
            fut = asyncio.run_coroutine_threadsafe(_handle_message(message), loop)
            fut.add_done_callback(_on_done)

    while True:
        try:
            await asyncio.to_thread(_sync_subscribe)
            logger.warning("Valkey listener exited — reconnecting...")
        except Exception as e:
            logger.error(f"Valkey listener error: {e} — retrying in {retry_delay}s")
        await asyncio.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, 60)


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
        await channel.connect(self_deaf=True)
        logger.info(f"Auto-joined voice channel: {channel.name} ({guild.name})")
    except Exception as e:
        logger.warning(f"Auto-join failed: {e}")


@bot.event
async def on_ready():
    logger.info(f"BGM Bot logged in as {bot.user}")
    logger.info(f"BGM_DIR: {configs.BGM_DIR}")
    logger.info(f"S3_BUCKET_NAME: {configs.S3_BUCKET_NAME}")
    logger.info(f"VOICE_CHANNEL_ID: {configs.VOICE_CHANNEL_ID}")
    try:
        await asyncio.to_thread(s3_audio.sync_audio_from_s3)
        # Log available audio files after sync
        if os.path.isdir(configs.BGM_DIR):
            bgm_files = os.listdir(configs.BGM_DIR)
            logger.info(f"BGM files available: {len(bgm_files)} files - {bgm_files[:5]}...")
        else:
            logger.error(f"BGM_DIR does not exist: {configs.BGM_DIR}")
    except Exception as e:
        logger.error(f"S3 audio sync failed: {e}")
    await _auto_join_voice()
    # Start the serialised background player — all play() requests go
    # through this queue so voice connect/cleanup never races.
    asyncio.create_task(_bgm_player())
    task = asyncio.create_task(_valkey_listener())
    task.add_done_callback(
        lambda t: logger.error(f"_valkey_listener task ended: {t.exception()}")
        if not t.cancelled() and t.exception() else None
    )


@bot.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    if member != bot.user:
        return
    # Bot was disconnected
    if before.channel and not after.channel:
        logger.warning("BGM Bot was disconnected from voice — rejoining with backoff...")
        for attempt in range(1, 6):
            try:
                await asyncio.sleep(2 * attempt)
                await _auto_join_voice()
                vc = bot.guilds[0].voice_client if bot.guilds else None
                if vc and vc.is_connected():
                    logger.info(f"Successfully rejoined voice (attempt {attempt})")
                    return
            except Exception as e:
                logger.warning(f"Reconnect attempt {attempt} failed: {e}")
        logger.error("Failed to reconnect after 5 attempts")


# ── Commands ─────────────────────────────────────────────────────────────────

@bot.command(name="play")
async def cmd_play(ctx: commands.Context, phase: str):
    """Manually play BGM for a game phase. Usage: !play vl"""
    music_file = _find_phase_file(phase)
    if not music_file:
        await ctx.send(f"No audio file found for phase '{phase}'")
        return
    if ctx.guild:
        await _bgm_queue.put((ctx.guild, music_file))
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

    bot.run(configs.BGM_BOT_TOKEN)
