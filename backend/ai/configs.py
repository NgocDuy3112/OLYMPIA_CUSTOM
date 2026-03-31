"""Shared configuration for the AI service.

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


# ── OpenRouter (primary) ─────────────────────────────────────────────────────

OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")

# ── Ollama (fallback) ────────────────────────────────────────────────────────

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")

# ── Embedding ────────────────────────────────────────────────────────────────

EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSION = int(os.getenv("EMBEDDING_DIMENSION", "1536"))

# ── PostgreSQL (shared with main app) ────────────────────────────────────────

POSTGRES_DB_USER = os.getenv("POSTGRES_DB_USER", "olympia")
POSTGRES_DB_PASSWORD = os.getenv("POSTGRES_DB_PASSWORD", "")
POSTGRES_DB_HOST = os.getenv("POSTGRES_DB_HOST", "postgresql")
POSTGRES_DB_PORT = int(os.getenv("POSTGRES_DB_PORT", "5432"))
POSTGRES_DB_NAME = os.getenv("POSTGRES_DB_NAME", "olympia_custom")

# ── Discord Chatbot ──────────────────────────────────────────────────────────

CHATBOT_BOT_TOKEN = os.getenv("CHATBOT_BOT_TOKEN", "")
VOICE_CHANNEL_ID = os.getenv("VOICE_CHANNEL_ID", "")

# ── RAG Settings ─────────────────────────────────────────────────────────────

RAG_TOP_K = int(os.getenv("RAG_TOP_K", "5"))
RAG_CHUNK_SIZE = int(os.getenv("RAG_CHUNK_SIZE", "500"))
RAG_CHUNK_OVERLAP = int(os.getenv("RAG_CHUNK_OVERLAP", "50"))
