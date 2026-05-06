"""Shared configuration for Discord bots.

Reads environment variables from the shared configs/.env file
(mounted by docker-compose.prod.yaml) so all services use one
source of truth.
"""

import os
from dotenv import load_dotenv

# Try loading from the shared configs/.env first (Docker),
# then fall back to local .env (development).
for _env_path in ("/app/.env", os.path.join(os.path.dirname(__file__), ".env")):
    if os.path.isfile(_env_path):
        load_dotenv(_env_path)
        break


# ── Discord ──────────────────────────────────────────────────────────────────

BGM_BOT_TOKEN = os.getenv("BGM_BOT_TOKEN", "")
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
# Dockerfile copies repo-level audios/ into /app/audios/
BGM_DIR = os.path.join(BASE_DIR, "audios", "bgm")
SFX_DIR = os.path.join(BASE_DIR, "audios", "sfx")

# Valkey connection URL
_password_part = f":{VALKEY_PASSWORD}@" if VALKEY_PASSWORD else ""
VALKEY_URL = f"redis://{_password_part}{VALKEY_HOST}:{VALKEY_PORT}/{VALKEY_DB}"

# ── Logging ──────────────────────────────────────────────────────────────────

LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG")