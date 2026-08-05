"""Discord Ping Bot — plays short ping SFX on key game events.

Listens to Valkey pub/sub for two specific events:
  - `keyword_submit`  → plays `gm_ping.mp3` (Giải Mã, player submits a keyword)
  - `buzzer_winner`   → plays `vd_ping.mp3` (Về Đích Riêng, player wins the buzzer)

Runs as a separate Discord bot so its voice playback doesn't interfere with the
BGM bot (timers/intro music) or the SFX bot (queued game effects).
"""

import asyncio
import logging
import os
import sys
import time

import discord
from discord.ext import commands

import configs
import s3_audio
from valkey_listener import get_valkey_client, subscribe_to_event_channels

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, configs.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger("ping-bot")

# ── Bot Setup ────────────────────────────────────────────────────────────────

intents = discord.Intents.default()
intents.voice_states = True
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

# Map of WebSocket event type → ping SFX file basename (without extension).
# Only fires when the bot is in a matching phase (see _handle_message).
EVENT_PING_MAP: dict[str, str] = {
    "keyword_submit": "gm_ping",   # Giải Mã — player submits a keyword guess
    "buzzer_winner":  "vd_ping",   # Về Đích Riêng — player wins the buzzer
}

# Phases in which each event is valid. Other phases are ignored.
EVENT_PHASE_RULES: dict[str, set[str]] = {
    "keyword_submit": {"gm"},
    "buzzer_winner":  {"vdr"},
}

_current_phase: str = ""

# Queue serialises voice connect/cleanup/play so back-to-back events
# never race on the Discord voice client. Each item stops the current
# playback and plays immediately (fire-and-forget) — newest audio wins.
_ping_queue: asyncio.Queue[str] = asyncio.Queue()

# Debounce: skip duplicate identical events within _DEBOUNCE_MS
_recent_events: dict[str, float] = {}
_DEBOUNCE_MS = 200


def _find_ping_file(basename: str) -> str | None:
    """Find the ping file for a given basename (case-insensitive)."""
    if not os.path.isdir(configs.PING_DIR):
        return None
    for filename in os.listdir(configs.PING_DIR):
        name, ext = os.path.splitext(filename)
        if name.lower() == basename.lower() and ext.lower() in (".mp3", ".ogg", ".wav"):
            return os.path.join(configs.PING_DIR, filename)
    return None


async def _get_voice_client() -> discord.VoiceClient | None:
    """Return the existing voice client, or connect if not already in channel."""
    # Reuse any live voice client we hold.
    for g in bot.guilds:
        vc = g.voice_client
        if vc is not None and vc.is_connected():
            return vc

    # No live client anywhere. Tear down the stale one on the target
    # guild (if any) — never touch voice clients on OTHER guilds,
    # doing so kicks the bot out of voice channels it should stay in.
    target_guild = bot.guilds[0] if bot.guilds else None
    if target_guild is not None and target_guild.voice_client is not None:
        logger.warning(f"Voice client on '{target_guild.name}' is stale — cleaning up")
        try:
            await target_guild.voice_client.disconnect(force=True)
        except Exception as e:
            logger.warning(f"Failed to disconnect stale client: {e}")
    try:
        channel = bot.get_channel(int(configs.VOICE_CHANNEL_ID))
        if channel is None:
            channel = await bot.fetch_channel(int(configs.VOICE_CHANNEL_ID))
        if isinstance(channel, discord.VoiceChannel):
            return await channel.connect(self_deaf=True)
    except discord.ClientException as e:
        # Race: another coroutine connected between our check and our call —
        # fall back to whatever client Discord just created.
        logger.warning(f"connect() raced — reusing the just-created client: {e}")
        vc = bot.guilds[0].voice_client if bot.guilds else None
        if vc is not None and vc.is_connected():
            return vc
    except Exception as e:
        logger.warning(f"Cannot get voice client: {e}")
    return None


async def _play_ping(file_path: str) -> None:
    """Play a single ping file in the configured voice channel.

    Fire-and-forget: stops any current playback and starts the new ping
    immediately. Does NOT wait for playback to finish — the next queue
    item will stop this one if it arrives sooner.
    """
    vc = await _get_voice_client()
    if not vc:
        return

    # Stop any current playback so the new ping starts immediately.
    if vc.is_playing():
        logger.info("Stopping current ping playback to play new audio")
        vc.stop()

    try:
        source = discord.FFmpegOpusAudio(file_path)
    except Exception as e:
        logger.error(f"Failed to create audio source for '{file_path}': {e}")
        return

    try:
        vc.play(source)
        logger.info(f"Playing ping: {os.path.basename(file_path)}")
    except discord.ClientException as e:
        logger.error(f"vc.play() failed (voice state desync?): {e} — tearing down for next call")
        try:
            await vc.disconnect(force=True)
        except Exception:
            pass


async def _ping_player():
    """Background task that processes the ping queue."""
    while True:
        file_path = await _ping_queue.get()
        try:
            await _play_ping(file_path)
        except Exception as e:
            logger.error(f"Error playing ping: {e}")
        finally:
            _ping_queue.task_done()


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
    logger.info(f"Ping Bot logged in as {bot.user}")
    logger.info(f"PING_DIR: {configs.PING_DIR}")
    logger.info(f"VOICE_CHANNEL_ID: {configs.VOICE_CHANNEL_ID}")
    try:
        await asyncio.to_thread(s3_audio.sync_audio_from_s3)
        if os.path.isdir(configs.PING_DIR):
            ping_files = os.listdir(configs.PING_DIR)
            logger.info(f"Ping files available: {len(ping_files)} files - {ping_files}")
        else:
            logger.error(f"PING_DIR does not exist: {configs.PING_DIR}")
    except Exception as e:
        logger.error(f"S3 audio sync failed: {e}")
    await _auto_join_voice()
    asyncio.create_task(_ping_player())
    asyncio.create_task(_valkey_listener())


@bot.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    if member != bot.user:
        return
    if before.channel and not after.channel:
        logger.warning("Ping Bot was disconnected from voice — rejoining with backoff...")
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


# ── Valkey event handler ──────────────────────────────────────────────────────

def _extract_phase(path: str) -> str | None:
    parts = path.strip("/").split("/")
    if len(parts) >= 2 and parts[0] == "player":
        return parts[1]
    return None


async def _handle_message(message: dict) -> None:
    """Dispatch a single Valkey message to the ping queue."""
    global _current_phase
    msg_type = message.get("type", "")
    logger.debug(f"Received event: type={msg_type!r} keys={list(message.keys())}")

    # Track current game phase from navigate and round_start events
    if msg_type == "navigate":
        phase = _extract_phase(message.get("path", ""))
        if phase and phase != _current_phase:
            _current_phase = phase
            _recent_events.clear()
            logger.info(f"Navigated to phase '{phase}' — debounce reset")

    if msg_type == "round_start":
        round_phase = message.get("round", "")
        if round_phase and round_phase != _current_phase:
            logger.info(f"Round started: '{round_phase}' — updating phase from '{_current_phase}'")
            _current_phase = round_phase
            _recent_events.clear()

    # Debounce: skip if the same event was queued recently
    current_time = time.time() * 1000
    if msg_type in _recent_events:
        time_since_last = current_time - _recent_events[msg_type]
        if time_since_last < _DEBOUNCE_MS:
            logger.debug(f"Debounced event '{msg_type}' (repeated {time_since_last:.0f}ms apart)")
            return
    _recent_events[msg_type] = current_time

    # Only handle events that are in our ping map
    base_name = EVENT_PING_MAP.get(msg_type)
    if not base_name:
        return

    # Phase filter: ignore if the bot is not in a valid phase for this event
    valid_phases = EVENT_PHASE_RULES.get(msg_type, set())
    if valid_phases and _current_phase not in valid_phases:
        logger.debug(
            f"Ignored event '{msg_type}' — current phase '{_current_phase}' "
            f"not in valid phases {valid_phases}"
        )
        return

    user_code = message.get("user_code", "unknown")
    logger.info(f"Queued ping '{base_name}' for event '{msg_type}' (user={user_code!r})")

    ping_file = _find_ping_file(base_name)
    if not ping_file:
        logger.warning(f"No ping file found for event '{msg_type}' (looked for '{base_name}')")
        return
    await _ping_queue.put(ping_file)


async def _valkey_listener():
    """Listen to Valkey pub/sub for game events.

    Runs the blocking subscriber in a thread so it never stalls the Discord
    heartbeat loop. Each message is dispatched back to the event loop via
    run_coroutine_threadsafe. Automatically reconnects with exponential backoff.
    """
    event_channel_pattern = configs.EVENT_CHANNEL_PATTERN
    loop = asyncio.get_running_loop()
    logger.info(f"Ping Bot listening to channel '{event_channel_pattern}'")
    retry_delay = 2

    def _on_done(fut: asyncio.Future) -> None:
        if not fut.cancelled() and fut.exception():
            logger.error(f"Message handler error: {fut.exception()}")

    def _sync_subscribe():
        valkey_client = get_valkey_client()
        for message in subscribe_to_event_channels(valkey_client, event_channel_pattern):
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

@bot.command(name="ping")
async def cmd_ping(ctx: commands.Context, event: str):
    """Manually trigger a ping for a given event. Usage: !ping gm_ping"""
    base_name = EVENT_PING_MAP.get(event, event)
    ping_file = _find_ping_file(base_name)
    if not ping_file:
        await ctx.send(f"No ping file found for event '{event}' (looked for '{base_name}')")
        return
    await _ping_queue.put(ping_file)
    await ctx.send(f"🔔 Queued ping: {base_name}")


# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not configs.PING_BOT_TOKEN:
        logger.error("PING_BOT_TOKEN not set in .env")
        sys.exit(1)

    bot.run(configs.PING_BOT_TOKEN)
