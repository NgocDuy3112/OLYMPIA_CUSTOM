from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import select

from logger import global_logger
from models.match import Match
from models.question import Question
from models.user import User, RoleEnum

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession
    from valkey.asyncio import Valkey


_ID_CACHE_TTL_SECONDS = 3600

_MATCH_KEY = "id:match:{match_code}"
_USER_KEY = "id:user:{user_code}"
_QUESTION_KEY = "id:question:{question_code}"


def _to_uuid(value: str | None) -> uuid.UUID | None:
    if value is None:
        return None
    try:
        return uuid.UUID(value)
    except (ValueError, TypeError):
        return None


async def resolve_buzz_ids(
    match_code: str,
    user_code: str,
    question_code: str,
    session: "AsyncSession",
    valkey: "Valkey",
) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    m_key = _MATCH_KEY.format(match_code=match_code)
    u_key = _USER_KEY.format(user_code=user_code)
    q_key = _QUESTION_KEY.format(question_code=question_code)

    try:
        cached = await valkey.mget(m_key, u_key, q_key)
    except Exception as exc:
        global_logger.warning(f"[id_cache] MGET failed: {exc}", exc_info=True)
        cached = [None, None, None]

    match_id = _to_uuid(cached[0]) if len(cached) > 0 else None
    player_id = _to_uuid(cached[1]) if len(cached) > 1 else None
    question_id = _to_uuid(cached[2]) if len(cached) > 2 else None

    if match_id is None:
        match_id = await session.scalar(
            select(Match.id).where(
                Match.match_code == match_code,
                Match.is_deleted == False,
            )
        )
        if match_id is not None:
            try:
                await valkey.set(m_key, str(match_id), ex=_ID_CACHE_TTL_SECONDS)
            except Exception as exc:
                global_logger.warning(f"[id_cache] SET match failed: {exc}", exc_info=True)

    if player_id is None:
        player_id = await session.scalar(
            select(User.id).where(
                User.user_code == user_code,
                User.role.in_([RoleEnum.player, RoleEnum.admin]),
                User.is_deleted == False,
            )
        )
        if player_id is not None:
            try:
                await valkey.set(u_key, str(player_id), ex=_ID_CACHE_TTL_SECONDS)
            except Exception as exc:
                global_logger.warning(f"[id_cache] SET user failed: {exc}", exc_info=True)

    if question_id is None:
        question_id = await session.scalar(
            select(Question.id).where(
                Question.question_code == question_code,
                Question.is_deleted == False,
            )
        )
        if question_id is not None:
            try:
                await valkey.set(q_key, str(question_id), ex=_ID_CACHE_TTL_SECONDS)
            except Exception as exc:
                global_logger.warning(f"[id_cache] SET question failed: {exc}", exc_info=True)

    return match_id, player_id, question_id