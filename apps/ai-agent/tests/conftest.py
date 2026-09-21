"""Set env giả trước khi import app.config — Settings không default."""

import os

os.environ.setdefault("VALKEY_HOST", "localhost")
os.environ.setdefault("VALKEY_PORT", "6379")
os.environ.setdefault("API_INTERNAL_URL", "http://localhost:8000/api")
os.environ.setdefault("AGENT_SERVICE_TOKEN", "test-token")
os.environ.setdefault("LLM_API_KEY", "test-key")
os.environ.setdefault("LLM_MODEL", "test-model")
os.environ.setdefault("LLM_BASE_URL", "http://llm.test/v1")
os.environ.setdefault("LLM_TIMEOUT", "30")
