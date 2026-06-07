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


async def get_first_buzzer(
    match_id,
    question_id,
    session: AsyncSession,
) -> Answer | None:
    """Return the first buzz (has_buzzed=True) for a given match+question, ordered by created_at."""
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
    global_logger.debug(f"POST request to add answer for question {request.question_code} in match {request.match_code} from player {request.user_code}")
    try:
        # Accept elapsed seconds from client (e.g., 13.456 seconds since timer start).
        # The client sends elapsed time, not Unix timestamp.
        # Clamp to reasonable range: 0 to 3600 seconds (1 hour max)
        client_ts = request.timestamp if request.timestamp is not None else None
        if client_ts is not None:
            try:
                client_ts = float(client_ts)
                # Clamp elapsed seconds to [0, 3600]
                effective_timestamp = max(0.0, min(3600.0, client_ts))
            except (ValueError, TypeError):
                effective_timestamp = 0.0
        else:
            effective_timestamp = 0.0

        # Validate existence of match, player and question first
        match_id = await session.scalar(
            select(Match.id).where(
                Match.match_code == request.match_code,
                Match.is_deleted == False
            )
        )
        if match_id is None:
            log_message = f"Match with match_code={request.match_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        # Find player ID
        player_id = await session.scalar(
            select(User.id).where(
                User.user_code == request.user_code,
                (User.role == 'player') | (User.role == 'admin'),
                User.is_deleted == False
            )
        )
        if player_id is None:
            log_message = f"Player with user_code={request.user_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        # Find question ID
        question_id = await session.scalar(
            select(Question.id).where(
                Question.question_code == request.question_code,
                Question.is_deleted == False
            )
        )
        if question_id is None:
            log_message = f"Question with question_code={request.question_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # ── Server-side buzz winner logic ─────────────────────────────────────
        # When a player buzzes, we use DB created_at as the authoritative timestamp.
        # The first buzzer (by created_at) is the winner.
        is_buzz = request.has_buzzed is True
        if is_buzz:
            # Check if this player already buzzed for this question
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

        # UPSERT: update existing answer if one exists, otherwise insert a new one.
        # Players can revise their answer multiple times; only the last submission is kept.
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

        # ── Determine buzz winner after commit ────────────────────────────────
        if is_buzz:
            first_buzzer = await get_first_buzzer(match_id, question_id, session)
            if first_buzzer is not None:
                winner_user = await session.scalar(
                    select(User.user_code).where(User.id == first_buzzer.player_id)
                )
                if winner_user == request.user_code:
                    # This player is the first buzzer — broadcast winner
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
                        global_logger.debug(
                            f"[BUZZ WINNER] Player {request.user_code} is the first buzzer "
                            f"for question {request.question_code} in match {request.match_code}"
                        )
                    except Exception as e:
                        global_logger.error(f"Failed to publish buzz winner: {e}", exc_info=True)

        # Cache the answer for fast reads and publish to match channel
        # Use effective_timestamp (server-clamped) instead of raw client timestamp
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
            # Log but do not fail the request since DB commit succeeded
            global_logger.error(f"Failed to cache/publish answer for key={cache_key}: {e}", exc_info=True)

        log_message = f"Successfully created answer for question_code={request.question_code} in match_code={request.match_code} from user_code={request.user_code}."
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message)
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



async def get_answer_from_db(
    match_code: str, 
    user_code: str,
    question_code: str,
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    global_logger.debug(f"[KDC ANSWER SYNC] GET request to fetch answer for question {question_code} in match {match_code} from player {user_code}")
    try:
        cache_key = f"answer:{match_code}:{user_code}:{question_code}"
        cached = await valkey.get(cache_key)
        if cached is not None:
            record_json = json.loads(cached)
            global_logger.debug(f"[KDC ANSWER SYNC] CACHE HIT for key={cache_key} answer={record_json.get('answer_text')} ts={record_json.get('timestamp')}")
            log_message = f"Fetched an answer from cache for key={cache_key}."
            global_logger.debug(log_message)
            return BaseResponse(
                status='success',
                message=log_message,
                data=record_json
            )
        global_logger.debug(f"[KDC ANSWER SYNC] CACHE MISS for key={cache_key}, fetching from DB")
        result = await session.execute(
            select(
                Answer
            ).join(
                Match, Answer.match_id == Match.id
            ).join(
                User, Answer.player_id == User.id
            ).join(
                Question, Answer.question_id == Question.id
            ).where(
                Match.match_code == match_code,
                User.user_code == user_code,
                (User.role == 'player') | (User.role == 'admin'),
                Question.question_code == question_code,
                Answer.is_deleted == False
            ).order_by(Answer.created_at.desc())
        )
        answer = result.scalars().first()
        if answer is None:
            log_message = f"Answer for question_code={question_code} in match_code={match_code} from user_code={user_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        answers_data = {
            'match_code': match_code,
            'user_code': user_code,
            'question_code': question_code,
            'answer_text': answer.answer_text,
            'has_buzzed': answer.has_buzzed,
            'timestamp': float(answer.timestamp) if answer.timestamp is not None else None
        }
        log_message = f"Fetched answer for question_code={question_code} in match_code={match_code} from user_code={user_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=answers_data 
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Failed to fetch answer for question_code={question_code} in match_code={match_code} from user_code={user_code}."
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=f"{log_message} Reason: {e}")


async def delete_answer_from_db(match_code: str, user_code: str, question_code: str, session: AsyncSession) -> BaseResponse:
    """Soft delete an answer from DB by setting is_deleted=True (if supported by model)."""
    global_logger.debug(f"Soft deleting answer for question {question_code} in match {match_code} from player {user_code}")
    try:
        # Find the answer by joining with Match, User, and Question to match codes
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
        
        # Check if Answer model has is_deleted field
        # Note: According to user, the model might not have is_deleted yet.
        # We will try to set it but need to handle the case where it might not exist.
        
        result = await session.execute(query)
        answer = result.scalars().one_or_none()

        if answer is None:
            log_message = f"No answer found for question_code={question_code} in match_code={match_code} from user_code={user_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # Check if already deleted if the attribute exists
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
