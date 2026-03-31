"""RAG pipeline for the OLYMPIA CUSTOM AI chatbot.

Retrieves relevant context from pgvector, augments the prompt,
and generates a response via LLM.
"""

from __future__ import annotations

from dataclasses import dataclass

from openai import AsyncOpenAI

import configs


# ── Data Types ───────────────────────────────────────────────────────────────

@dataclass
class Document:
    """A chunk of text with metadata for RAG retrieval."""
    content: str
    source: str          # e.g. "questions", "rules", "docs"
    source_id: str       # e.g. question_code, doc path
    score: float         # similarity score


# ── LLM Client ───────────────────────────────────────────────────────────────

def get_llm_client() -> tuple[AsyncOpenAI, str]:
    """Create an async OpenAI-compatible client and return the model name.

    Uses OpenRouter by default. Falls back to Ollama if
    OPENROUTER_API_KEY is not set.

    Returns:
        Tuple of (client, model_name).
    """
    if configs.OPENROUTER_API_KEY:
        return AsyncOpenAI(
            api_key=configs.OPENROUTER_API_KEY,
            base_url=configs.OPENROUTER_BASE_URL,
        ), configs.OPENROUTER_MODEL
    # Fallback to Ollama (no API key needed)
    return AsyncOpenAI(
        api_key="ollama",
        base_url=configs.OLLAMA_BASE_URL,
    ), configs.OLLAMA_MODEL


# ── RAG Pipeline ─────────────────────────────────────────────────────────────

async def retrieve_context(query: str, top_k: int = configs.RAG_TOP_K) -> list[Document]:
    """Retrieve relevant documents from pgvector.

    TODO: Implement pgvector similarity search.
    For now, returns empty list — replace with actual DB query.

    Example query (once pgvector is set up):
        SELECT content, source, source_id,
               embedding <=> $1 AS score
        FROM knowledge_base
        ORDER BY score
        LIMIT $2;
    """
    # Placeholder — implement when pgvector extension is added
    return []


async def generate_response(
    query: str,
    context: list[Document],
    system_prompt: str | None = None,
) -> str:
    """Generate a response using LLM with RAG context.

    Args:
        query: User's question.
        context: Retrieved documents from pgvector.
        system_prompt: Optional custom system prompt.

    Returns:
        Generated response text.
    """
    # Build context string
    context_text = ""
    if context:
        context_text = "Dựa trên thông tin sau:\n\n"
        for i, doc in enumerate(context, 1):
            context_text += f"[{i}] ({doc.source}) {doc.content}\n\n"
    else:
        context_text = "(Không tìm thấy thông tin liên quan trong cơ sở dữ liệu.)\n\n"

    # Default system prompt
    if not system_prompt:
        system_prompt = (
            "Bạn là trợ lý ảo của cuộc thi Olympia Custom 3 — một trò chơi quiz show. "
            "Hãy trả lời dựa trên thông tin được cung cấp. Nếu không có thông tin, "
            "hãy nói rõ là bạn không biết, đừng bịa đáp án."
        )

    client, model = get_llm_client()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"{context_text}Câu hỏi: {query}"},
    ]

    response = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=0.3,
        max_tokens=500,
    )

    return response.choices[0].message.content or "Xin lỗi, tôi không thể trả lời câu hỏi này."


async def rag_query(query: str, system_prompt: str | None = None) -> str:
    """Full RAG pipeline: retrieve → augment → generate."""
    context = await retrieve_context(query)
    return await generate_response(query, context, system_prompt)
