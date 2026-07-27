from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from valkey.asyncio import Valkey
import json

from logger import global_logger
from models.answer import Answer
from models.question import Question
from models.match import Match
from models.user import User
from schemas.answer import *
from utils.buzzer_lock import (
    try_acquire_buzzer_lock,
    release_buzzer_lock,
)
from utils.buzzer_winners import set_buzzer_winner
from utils.id_cache import resolve_buzz_ids


async def get_first_buzzer(
    match_id,
    question_id,
    session: AsyncSession,
) -> Answer | None:
    result = await session.execute(
        select(Answer)
        .where(
            Answer.match_id == match_id,
            Answer.question_id == question_id,
            Answer.has_buzzed == True,
            Answer.is_deleted == False,
        )
        .order_by(Answer.created_at.asc())
        .limit(1)
    )
    return result.scalars().first()


async def post_answer_to_db(
    request: AnswerPostRequest,
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    if request.has_buzzed:
        global_logger.info(
            f"[BUZZ] POST /answers/ from {request.user_code!r} for question={request.question_code!r} "
            f"match={request.match_code!r}"
        )
    else:
        global_logger.debug(f"POST request to add answer for question {request.question_code} in match {request.match_code} from player {request.user_code}")
    buzzer_lock_token: str | None = None
    try:
        client_ts = request.timestamp if request.timestamp is not None else None
        if client_ts is not None:
            try:
                client_ts = float(client_ts)
                effective_timestamp = max(0.0, min(3600.0, client_ts))
            except (ValueError, TypeError):
                effective_timestamp = 0.0
        else:
            effective_timestamp = 0.0

        match_id, player_id, question_id = await resolve_buzz_ids(
            request.match_code,
            request.user_code,
            request.question_code,
            session,
            valkey,
        )
        if match_id is None:
            log_message = f"Match with match_code={request.match_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        if player_id is None:
            log_message = f"Player with user_code={request.user_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        if question_id is None:
            log_message = f"Question with question_code={request.question_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        is_buzz = request.has_buzzed is True
        if is_buzz:
            buzzer_lock_token = await try_acquire_buzzer_lock(
                valkey, request.match_code, request.question_code,
            )
            if buzzer_lock_token is None:
                global_logger.info(
                    f"[BUZZ] Player {request.user_code!r} lost the race for "
                    f"question={request.question_code!r} match={request.match_code!r}"
                )
                raise HTTPException(
                    status_code=409,
                    detail=f"Buzzer already claimed for question {request.question_code}",
                )
            existing_buzz = await session.scalar(
                select(Answer.id).where(
                    Answer.player_id == player_id,
                    Answer.match_id == match_id,
                    Answer.question_id == question_id,
                    Answer.has_buzzed == True,
                    Answer.is_deleted == False,
                )
            )
            if existing_buzz is not None:
                log_message = f"Player {request.user_code} already buzzed for question {request.question_code}."
                global_logger.info(log_message)
                return BaseResponse(status="success", message=log_message)

        cache_key = f"answer:{request.match_code}:{request.user_code}:{request.question_code}"

        db_res = await session.execute(
            select(Answer).where(
                Answer.player_id == player_id,
                Answer.match_id == match_id,
                Answer.question_id == question_id,
                Answer.is_deleted == False,
            )
        )
        existing_answer = db_res.scalars().first()

        if existing_answer is not None:
            existing_answer.answer_text = request.answer_text
            existing_answer.timestamp = effective_timestamp
            existing_answer.has_buzzed = request.has_buzzed
            global_logger.debug(f"Updating existing answer for question_code={request.question_code} from user_code={request.user_code}.")
        else:
            new_answer = Answer(
                answer_text=request.answer_text,
                has_buzzed=request.has_buzzed,
                timestamp=effective_timestamp,
                player_id=player_id,
                match_id=match_id,
                question_id=question_id,
            )
            session.add(new_answer)
        await session.commit()

        if is_buzz:
            winner_payload = {
                "type": "buzzer_winner",
                "user_code": request.user_code,
                "match_code": request.match_code,
                "question_code": request.question_code,
            }
            block_payload = {
                "type": "blocked_buzz",
                "user_code": None,
                "match_code": request.match_code,
            }
            try:
                await valkey.publish(
                    channel=request.match_code,
                    message=json.dumps(winner_payload),
                )
                await valkey.publish(
                    channel=request.match_code,
                    message=json.dumps(block_payload),
                )
                global_logger.info(
                    f"[BUZZ WINNER] Player {request.user_code!r} won the buzzer "
                    f"for question {request.question_code!r} in match {request.match_code!r}"
                )

                await set_buzzer_winner(
                    valkey,
                    request.match_code,
                    request.question_code,
                    request.user_code,
                )
            except Exception as e:
                global_logger.error(f"Failed to publish buzz winner: {e}", exc_info=True)

        if not is_buzz:
            cache_payload = {
                "match_code": request.match_code,
                "user_code": request.user_code,
                "question_code": request.question_code,
                "answer_text": request.answer_text,
                "has_buzzed": request.has_buzzed,
                "timestamp": effective_timestamp,
                "type": "answer",
            }
            try:
                await valkey.set(cache_key, json.dumps(cache_payload))
                await valkey.publish(channel=request.match_code, message=json.dumps(cache_payload))
                global_logger.debug(f"[KDC ANSWER SYNC] Cached and published answer for match={request.match_code} user={request.user_code} question={request.question_code} answer={request.answer_text} ts={effective_timestamp}")
            except Exception as e:
                global_logger.error(f"Failed to cache/publish answer for key={cache_key}: {e}", exc_info=True)

        global_logger.debug(
            f"Successfully created answer for question_code={request.question_code} in match_code={request.match_code} from user_code={request.user_code}."
        )
        buzzer_lock_token = None
        return BaseResponse(status="success", message=f"Answer recorded for question_code={request.question_code}")
    except IntegrityError:
        await session.rollback()
        log_message = f"Integrity error when creating answer for question_code={request.question_code} in match_code={request.match_code} from user_code={request.user_code}."
        global_logger.warning(log_message)
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        log_message = f"Failed to create answer for question_code={request.question_code} in match_code={request.match_code} from user_code={request.user_code}."
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=f"{log_message} Reason: {e}")
    finally:
        if buzzer_lock_token is not None and valkey:
            try:
                await release_buzzer_lock(
                    valkey,
                    request.match_code,
                    request.question_code,
                    buzzer_lock_token,
                )
            except Exception as exc:
                global_logger.warning(
                    f"[buzzer_lock] finally-release failed for "
                    f"match={request.match_code!r} question={request.question_code!r}: {exc}",
                    exc_info=True,
                )



async def get_answer_from_db(
    match_code: str,
    user_code: str | None,
    question_code: str | None,
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    global_logger.debug(
        f"GET /answers/ match_code={match_code!r} user_code={user_code!r} question_code={question_code!r}"
    )
    try:
        if user_code is not None and question_code is not None:
            cache_key = f"answer:{match_code}:{user_code}:{question_code}"
            cached = await valkey.get(cache_key)
            if cached is not None:
                record_json = json.loads(cached)
                global_logger.debug(f"[KDC ANSWER SYNC] CACHE HIT for key={cache_key}")
                return BaseResponse(
                    status='success',
                    message=f"Fetched an answer from cache for key={cache_key}.",
                    data=record_json
                )
            global_logger.debug(f"[KDC ANSWER SYNC] CACHE MISS for key={cache_key}, fetching from DB")

        stmt = (
            select(
                Answer,
                Match.match_code.label("m_code"),
                User.user_code.label("u_code"),
                Question.question_code.label("q_code"),
            )
            .join(Match, Answer.match_id == Match.id)
            .join(User, Answer.player_id == User.id)
            .join(Question, Answer.question_id == Question.id)
            .where(
                Match.match_code == match_code,
                Answer.is_deleted == False,
                Match.is_deleted == False,
                (User.role == 'player') | (User.role == 'admin'),
            )
        )
        if user_code is not None:
            stmt = stmt.where(User.user_code == user_code)
        if question_code is not None:
            stmt = stmt.where(Question.question_code == question_code)
        stmt = stmt.order_by(Answer.created_at.desc())

        result = await session.execute(stmt)
        rows = result.all()

        if not rows:
            log_message = (
                f"No answers found for match_code={match_code} "
                f"user_code={user_code} question_code={question_code}."
            )
            if user_code is not None and question_code is not None:
                global_logger.warning(log_message)
                raise HTTPException(status_code=404, detail=log_message)
            global_logger.debug(log_message)
            return BaseResponse(
                status='success',
                message=log_message,
                data=[]
            )

        def _serialize(row) -> dict:
            answer = row[0]
            return {
                'match_code': row.m_code,
                'user_code': row.u_code,
                'question_code': row.q_code,
                'answer_text': answer.answer_text,
                'has_buzzed': answer.has_buzzed if answer.has_buzzed is not None else False,
                'timestamp': float(answer.timestamp) if answer.timestamp is not None else None,
                'created_at': answer.created_at.isoformat() if answer.created_at is not None else None,
                'updated_at': answer.updated_at.isoformat() if answer.updated_at is not None else None,
            }

        if user_code is not None and question_code is not None:
            answers_data = _serialize(rows[0])
            global_logger.debug(
                f"Fetched answer for question_code={question_code} in match_code={match_code} from user_code={user_code}."
            )
            return BaseResponse(
                status='success',
                message=f"Answer for question_code={question_code}",
                data=answers_data
            )

        answers_list = [_serialize(r) for r in rows]
        log_message = (
            f"Fetched {len(answers_list)} answers for match_code={match_code} "
            f"user_code={user_code} question_code={question_code}."
        )
        global_logger.debug(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=answers_list
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = (
            f"Failed to fetch answers for match_code={match_code} "
            f"user_code={user_code} question_code={question_code}."
        )
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=f"{log_message} Reason: {e}")


async def delete_answer_from_db(match_code: str, user_code: str, question_code: str, session: AsyncSession) -> BaseResponse:
    global_logger.debug(f"Soft deleting answer for question {question_code} in match {match_code} from player {user_code}")
    try:
        query = (
            select(Answer)
            .join(Match, Answer.match_id == Match.id)
            .join(User, Answer.player_id == User.id)
            .join(Question, Answer.question_id == Question.id)
            .where(
                Match.match_code == match_code,
                User.user_code == user_code,
                Question.question_code == question_code
            )
        )

        result = await session.execute(query)
        answer = result.scalars().one_or_none()

        if answer is None:
            log_message = f"No answer found for question_code={question_code} in match_code={match_code} from user_code={user_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        if hasattr(answer, 'is_deleted') and answer.is_deleted:
            log_message = f"Answer already deleted for question_code={question_code} in match_code={match_code} from user_code={user_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=400, detail=log_message)

        try:
            answer.is_deleted = True
            await session.commit()
        except Exception as e:
            await session.rollback()
            log_message = f"Model 'Answer' might not have 'is_deleted' attribute yet: {str(e)}"
            global_logger.error(log_message, exc_info=True)
            raise HTTPException(status_code=500, detail="Failed to soft delete answer. Model might need update.")

        log_message = f"Answer for question_code={question_code} in match_code={match_code} from user_code={user_code} has been soft deleted successfully."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while deleting answer for question_code={question_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)
