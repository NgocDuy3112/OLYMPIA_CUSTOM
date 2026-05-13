"""Discord SFX Bot — plays sound effects on game events.

Listens to Valkey pub/sub for game events and plays short
sound effects (buzzer, timer, correct/wrong answer, etc.)
in the configured voice channel.
"""

import asyncio
import logging
import os
import sys
import time
import threading

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

# Map of event type → SFX file basename (without extension).
# Basenames must match filenames inside configs.SFX_DIR (case-insensitive).
EVENT_SFX_MAP = {
    "bp_dung":           "bp_dung",
    "kd_cong_diem":      "kd_dung",
    "open_match":        "mo_tran_dau",
    "introduce_players": "gioi_thieu_thi_sinh",
    "show_scoreboard":   "tong_ket_diem_so",
    "end_match":         "ket_thuc_tran_dau",
}

# Phase-specific overrides: { phase: { event_type: sfx_basename } }
# Takes priority over EVENT_SFX_MAP when the bot is in a matching phase.
PHASE_EVENT_SFX_MAP: dict[str, dict[str, str]] = {
    "kdc": {
        "navigate":                "kd_bat_dau",
        "send_answers_to_players": "kd_hien_tra_loi",
        "round_end":               "kd_ket_thuc",
    },
    "kdr": {
        "navigate":                "kd_bat_dau",
        "send_answers_to_players": "kd_hien_tra_loi",
        "wrong":                   "kd_sai",
        "skip":                    "kd_sai",
        "round_end":               "kd_ket_thuc",
    },
    "vdc": {
        "navigate":                "vd_bat_dau",
        "wrong":                   "vd_sai",
        "send_answers_to_players": "vd_hien_tra_loi",
        "answer":                  "vd_dung",
    },
    "vdr": {
        "navigate":                "vd_bat_dau",
        "wrong":                   "vd_sai",
        "send_answers_to_players": "vd_hien_tra_loi",
        "answer":                  "vd_dung",
        "power_star":              "vd_nshv",
        "power_shield":            "vd_bhmt",
    },
    "bp": {
        "navigate":                "bp_bat_dau",
        "bp_chon_cau_hoi":         "bp_chon_cau_hoi",
        "answer":                  "bp_dung",
        "send_answers_to_players": "bp_hien_tra_loi",
    },
    "gm": {
        "navigate":                "gm_bat_dau",
        "answer":                  "gm_dung",
        "send_answers_to_players": "gm_hien_tra_loi",
        "show_hint":               "gm_chon_goi_y",
        "keyword_correct":         "gm_dung_tu_khoa",
        "round_end":               "gm_ket_thuc",
    },
}

_current_phase: str = ""
_timer_task: asyncio.Task | None = None  # Tracks the pending timer_end sleep so we can cancel it on phase change

# Queue for sequential SFX playback
_sfx_queue: asyncio.Queue[str] = asyncio.Queue()
_is_playing = threading.Event()

# Debounce: track recent event types to prevent duplicate queuing
_recent_events: dict[str, float] = {}  # event_type -> last_time
_DEBOUNCE_MS = 200  # 200ms minimum between identical events


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
            return await channel.connect(self_deaf=True)
    except Exception as e:
        logger.warning(f"Cannot get voice client: {e}")
    return None


async def _play_sfx(file_path: str) -> None:
    """Play a sound effect in the configured voice channel."""
    vc = await _get_voice_client()
    if not vc:
        return

    # Wait if something is already playing
    while _is_playing.is_set():
        await asyncio.sleep(0.1)

    _is_playing.set()
    try:
        source = discord.FFmpegOpusAudio(file_path)
    except Exception as e:
        logger.error(f"Failed to create audio source for '{file_path}': {e}")
        _is_playing.clear()
        return

    def _after_play(err: Exception | None) -> None:
        _is_playing.clear()

    vc.play(source, after=_after_play)
    logger.info(f"Playing SFX: {os.path.basename(file_path)}")

    # Wait for playback to finish
    while vc.is_playing():
        await asyncio.sleep(0.1)

    _is_playing.clear()


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
        await channel.connect(self_deaf=True)
        logger.info(f"Auto-joined voice channel: {channel.name} ({guild.name})")
    except Exception as e:
        logger.warning(f"Auto-join failed: {e}")


@bot.event
async def on_ready():
    logger.info(f"SFX Bot logged in as {bot.user}")
    try:
        await asyncio.to_thread(s3_audio.sync_audio_from_s3)
    except Exception as e:
        logger.error(f"S3 audio sync failed: {e}")
    await _auto_join_voice()
    asyncio.create_task(_sfx_player())
    asyncio.create_task(_valkey_listener())


@bot.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    if member != bot.user:
        return
    # Bot was disconnected
    if before.channel and not after.channel:
        logger.warning("SFX Bot was disconnected from voice — rejoining with backoff...")
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


def _extract_phase(path: str) -> str | None:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


async def _schedule_timer_end(delay: int, sfx_file: str) -> None:
    """Sleep for 'delay' seconds then queue the timer_end SFX.

    Cancelled automatically when a phase change occurs (navigating away),
    preventing timer_end from playing in the wrong phase.
    """
    try:
        await asyncio.sleep(delay)
        await _sfx_queue.put(sfx_file)
        logger.info(f"Queued timer_end SFX after {delay}s delay")
    except asyncio.CancelledError:
        logger.debug("timer_end task cancelled (phase changed during timer)")


async def _handle_message(message: dict) -> None:
    """Dispatch a single Valkey message to the SFX queue (runs on the event loop)."""
    global _current_phase
    msg_type = message.get("type", "")
    logger.debug(f"Received event: type={msg_type!r} keys={list(message.keys())}")

    # Track current game phase from navigate events and clear queue on phase change
    if msg_type == "navigate":
        phase = _extract_phase(message.get("path", ""))
        if phase and phase != _current_phase:
            _current_phase = phase
            # Cancel any pending timer_end task since the phase changed
            global _timer_task
            if _timer_task and not _timer_task.done():
                _timer_task.cancel()
                _timer_task = None
            # Clear the queue when transitioning to a new phase to prevent audio carryover
            while not _sfx_queue.empty():
                try:
                    _sfx_queue.get_nowait()
                    _sfx_queue.task_done()
                except asyncio.QueueEmpty:
                    break
            _recent_events.clear()  # Clear debounce tracking on phase change
            logger.info(f"Navigated to phase '{phase}' — queue cleared and debounce reset")

    # Track phase from round_end events
    if msg_type == "round_end":
        round_phase = message.get("round", "")
        if round_phase:
            _current_phase = round_phase
        # Cancel pending timer_end since the round ended
        if _timer_task and not _timer_task.done():
            _timer_task.cancel()
            _timer_task = None

    # Queue timer_end SFX after the timer duration elapses
    if msg_type == "start_the_timer":
        if not _current_phase:
            _current_phase = message.get("phase", "")
        time_limit = int(message.get("time_limit", 30))
        sfx_file = _find_sfx_file("timer_end")
        if sfx_file:
            # Cancel any previously scheduled timer_end
            if _timer_task and not _timer_task.done():
                _timer_task.cancel()
            _timer_task = asyncio.create_task(
                _schedule_timer_end(time_limit, sfx_file)
            )

    # Debounce: skip if the same event was queued recently
    current_time = time.time() * 1000  # milliseconds
    if msg_type in _recent_events:
        time_since_last = current_time - _recent_events[msg_type]
        if time_since_last < _DEBOUNCE_MS:
            logger.debug(f"Debounced event '{msg_type}' (repeated {time_since_last:.0f}ms apart)")
            return
    
    _recent_events[msg_type] = current_time

    # Convert veDich_power_activated to a phase-specific event type
    effective_event = msg_type
    if msg_type == "veDich_power_activated":
        power = message.get("power")
        if power == "star":
            effective_event = "power_star"
        elif power == "shield":
            effective_event = "power_shield"
        else:
            return  # power is null (deactivated) — no SFX

    # Resolve SFX: phase-specific override takes priority over generic map
    phase_override = PHASE_EVENT_SFX_MAP.get(_current_phase, {}).get(effective_event)
    if phase_override:
        for ext in (".mp3", ".ogg", ".wav"):
            path = os.path.join(configs.SFX_DIR, f"{phase_override}{ext}")
            if os.path.isfile(path):
                await _sfx_queue.put(path)
                logger.debug(f"Queued phase-specific SFX for '{effective_event}': {os.path.basename(path)}")
                break
    else:
        sfx_file = _find_sfx_file(msg_type)
        if sfx_file:
            await _sfx_queue.put(sfx_file)
            logger.debug(f"Queued generic SFX for '{msg_type}': {os.path.basename(sfx_file)}")


async def _valkey_listener():
    """Listen to Valkey pub/sub for game events.

    Runs the blocking subscriber in a thread so it never stalls the Discord
    heartbeat loop. Each message is dispatched back to the event loop via
    run_coroutine_threadsafe. Automatically reconnects with exponential backoff.
    """
    match_code = configs.MATCH_CODE
    loop = asyncio.get_running_loop()
    logger.info(f"SFX Bot listening to channel '{match_code}'")
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
