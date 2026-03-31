# OLYMPIA CUSTOM AI Service

RAG-powered chatbot for the quiz game platform.

## Architecture

```
PostgreSQL (pgvector)
     ↓ retrieve relevant context
  RAG Pipeline
     ↓ augment prompt
LLM (OpenRouter / Ollama)
     ↓ response
Discord / Web / API
```

## Setup (Future)

```bash
cd backend/ai
pip install -r requirements.txt
python main.py
```

## Components

| File | Purpose |
|------|---------|
| `main.py` | FastAPI entry point + Discord bot |
| `rag.py` | RAG pipeline (retrieve → augment → generate) |
| `embeddings.py` | Text embedding via OpenRouter or local model |
| `prompts.py` | System prompts for different contexts |
| `indexer.py` | Index questions/rules into pgvector |

## Data Sources for RAG

| Source | Content | Embedding Strategy |
|--------|---------|-------------------|
| `questions` table | Question text, answers, explanations | Embed each question |
| `matches` table | Match rules, formats | Embed match descriptions |
| `docs/` | Game rules, API docs | Embed documentation |
| Valkey (real-time) | Current scores, player status | Not embedded — queried directly |
