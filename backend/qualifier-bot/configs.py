"""Shared configuration for the qualifier-bot service.

Reads environment variables from the shared configs/.env file
(mounted by docker-compose) so all services use one source of truth.
"""

import os
from dotenv import load_dotenv
from pathlib import Path

for _env_path in ("/app/.env", str(Path(__file__).parent.parent.parent / "configs" / ".env")):
    if os.path.isfile(_env_path):
        load_dotenv(_env_path)
        break


# ── PostgreSQL ────────────────────────────────────────────────────────────────

POSTGRES_DB_USER     = os.getenv("POSTGRES_DB_USER", "postgres")
POSTGRES_DB_PASSWORD = os.getenv("POSTGRES_DB_PASSWORD", "")
POSTGRES_DB_HOST     = os.getenv("POSTGRES_DB_HOST", "postgresql")
POSTGRES_DB_PORT     = int(os.getenv("POSTGRES_DB_PORT", "5432"))
POSTGRES_DB_NAME     = os.getenv("POSTGRES_DB_NAME", "oc3")

# ── Backend API ───────────────────────────────────────────────────────────────

API_URL = os.getenv("API_URL", "http://app:8000")

# ── Qualifier settings ────────────────────────────────────────────────────────

MATCH_CODE    = os.getenv("MATCH_CODE", "OC3_M_VL")
MATCH_NAME    = os.getenv("MATCH_NAME", "Vong Loai Test")
PLAYER_PREFIX = os.getenv("PLAYER_PREFIX", "OC_U_P03TST")
PLAYER_PW     = os.getenv("PLAYER_PW", "testpass1")
N_PLAYERS     = int(os.getenv("N_PLAYERS", "20"))

# ── Bot behaviour ─────────────────────────────────────────────────────────────

CORRECT_RATE = float(os.getenv("CORRECT_RATE", "0.75"))
SKIP_RATE    = float(os.getenv("SKIP_RATE", "0.10"))
MIN_DELAY    = float(os.getenv("MIN_DELAY", "0.5"))
MAX_DELAY    = float(os.getenv("MAX_DELAY", "9.0"))
