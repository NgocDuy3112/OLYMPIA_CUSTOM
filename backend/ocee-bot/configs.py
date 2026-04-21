"""Shared configuration for Discord bots.

Reads environment variables from the shared configs/.env file
(mounted by docker-compose.prod.yaml) so all services use one
source of truth.
"""

import os
from dotenv import load_dotenv
from pathlib import Path

# Try loading from the shared configs/.env first (Docker),
# then fall back to local .env (development).
for _env_path in ("/app/.env", os.path.join(os.path.dirname(__file__), ".env")):
    if os.path.isfile(_env_path):
        load_dotenv(_env_path)
        break


# ── Discord ──────────────────────────────────────────────────────────────────

# Backwards-compatible: prefer BGM_BOT_TOKEN, fall back to MUSIC_BOT_TOKEN if present
BGM_BOT_TOKEN = os.getenv("BGM_BOT_TOKEN", os.getenv("MUSIC_BOT_TOKEN", ""))
SFX_BOT_TOKEN = os.getenv("SFX_BOT_TOKEN", "")
VOICE_CHANNEL_ID = os.getenv("VOICE_CHANNEL_ID", "")

# ── Valkey / Redis ───────────────────────────────────────────────────────────

VALKEY_HOST = os.getenv("VALKEY_HOST", "localhost")
VALKEY_PORT = int(os.getenv("VALKEY_PORT", "6379"))
VALKEY_PASSWORD = os.getenv("VALKEY_PASSWORD", "") or None
VALKEY_DB = int(os.getenv("VALKEY_DB", "0"))

# Default match code for bots to subscribe to (can be overridden per-deployment)
MATCH_CODE = os.getenv("MATCH_CODE", "OC3_M_VL")

# ── Paths ────────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Locate the repository-level 'audios' directory. Support both local dev layout
# (repo root contains 'audios/') and container layout where audios are copied to /app/audios.
POSSIBLE_AUDIO_ROOTS = [
    Path(BASE_DIR) / "audios",
    Path(BASE_DIR).parent / "audios",
    Path(BASE_DIR).parent.parent / "audios",
    Path("/app") / "audios",
    Path("/audios"),
]

AUDIO_ROOT = None
for p in POSSIBLE_AUDIO_ROOTS:
    try:
        if p.exists():
            AUDIO_ROOT = p
            break
    except Exception:
        continue

if AUDIO_ROOT is None:
    # fallback to repo-root candidate (parent.parent) even if it doesn't exist yet
    AUDIO_ROOT = Path(BASE_DIR).parent.parent / "audios"

# Default audio directories (user stores audio files under <audio_root>/bgm and /sfx)
MUSIC_DIR = str(AUDIO_ROOT / "bgm")
SFX_DIR = str(AUDIO_ROOT / "sfx")

# Mapping of BGM keys to file paths. Bots will attempt to play these when events occur.
BGM_FILES = {
    "timer_10": AUDIO_ROOT / "bgm" / "VL_10s.ogg",
    "timer_15": AUDIO_ROOT / "bgm" / "VL_15s.ogg",
    "timer_30": AUDIO_ROOT / "bgm" / "VL_30s.ogg",
    "decoding": AUDIO_ROOT / "bgm" / "decoding.mp3",
    "applause": AUDIO_ROOT / "bgm" / "applause.mp3",
    "boo": AUDIO_ROOT / "bgm" / "boo.mp3",
    "neutral": AUDIO_ROOT / "bgm" / "neutral.mp3",
}

# ── Logging ──────────────────────────────────────────────────────────────────

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
