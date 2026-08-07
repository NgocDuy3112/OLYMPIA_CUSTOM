"""Shared configuration for Discord bots.

Reads environment variables from the shared configs/.env file
(mounted by docker-compose.stage.yaml) so all services use one
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
PING_BOT_TOKEN = os.getenv("PING_BOT_TOKEN", "")
VOICE_CHANNEL_ID = os.getenv("VOICE_CHANNEL_ID", "")

# ── Valkey / Redis ───────────────────────────────────────────────────────────

VALKEY_HOST = os.getenv("VALKEY_HOST", "localhost")
VALKEY_PORT = int(os.getenv("VALKEY_PORT", "6379"))
VALKEY_USER = os.getenv("VALKEY_USER", "") or None
VALKEY_PASSWORD = os.getenv("VALKEY_PASSWORD", "") or None
VALKEY_DB = int(os.getenv("VALKEY_DB", "0"))

# Default match code for bots to subscribe to. Built from SEASON so all services
# (FastAPI backend, BGM/SFX/ping bots) target the same season's match channels.
# The trailing "*" makes this a Valkey pattern (psubscribe) so a single bot
# instance receives events from every match of the current season.
SEASON = os.getenv("SEASON", "3")
MATCH_CODE = os.getenv("MATCH_CODE", f"OC{SEASON}_M*")
EVENT_CHANNEL_PATTERN = os.getenv("EVENT_CHANNEL_PATTERN", f"events:{MATCH_CODE}")

# ── Paths ────────────────────────────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Dockerfile copies repo-level audios/ into /app/audios/
BGM_DIR = os.path.join(BASE_DIR, "audios", "bgm")
SFX_DIR = os.path.join(BASE_DIR, "audios", "sfx")
PING_DIR = os.path.join(BASE_DIR, "audios", "ping")

# Valkey connection URL
_auth_part = f"{VALKEY_USER or ''}:{VALKEY_PASSWORD}@" if VALKEY_PASSWORD else ""
VALKEY_URL = f"redis://{_auth_part}{VALKEY_HOST}:{VALKEY_PORT}/{VALKEY_DB}"

# ── S3 ───────────────────────────────────────────────────────────────────────

S3_ENDPOINT_URL      = os.getenv("S3_ENDPOINT_URL", "")
S3_REGION            = os.getenv("S3_REGION", "us-east-1")
S3_BUCKET_NAME       = os.getenv("S3_BUCKET_NAME", "")
S3_ACCESS_KEY_ID     = os.getenv("S3_ACCESS_KEY_ID", "")
S3_SECRET_ACCESS_KEY = os.getenv("S3_SECRET_ACCESS_KEY", "")

# ── Logging ──────────────────────────────────────────────────────────────────

LOG_LEVEL = os.getenv("LOG_LEVEL", "DEBUG")