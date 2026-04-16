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



async def post_answer_to_db(
    request: AnswerPostRequest, 
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    global_logger.info(f"POST request to add answer for question {request.question_code} in match {request.match_code} from player {request.user_code}")
    try:
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

        # Enforce single-answer-per-player for qualifier questions (and generally avoid duplicates)
        cache_key = f"answer:{request.match_code}:{request.user_code}:{request.question_code}"
        cached = await valkey.get(cache_key)
        if cached is not None:
            log_message = f"Player {request.user_code} already submitted answer for question {request.question_code}; rejecting duplicate."
            global_logger.warning(log_message)
            raise HTTPException(status_code=400, detail=log_message)

        # Fallback DB check in case cache missed
        db_res = await session.execute(
            select(Answer.id).where(
                Answer.player_id == player_id,
                Answer.match_id == match_id,
                Answer.question_id == question_id,
                Answer.is_deleted == False,
            )
        )
        if db_res.first() is not None:
            log_message = f"Player {request.user_code} already has a stored answer for question {request.question_code}; rejecting duplicate."
            global_logger.warning(log_message)
            raise HTTPException(status_code=400, detail=log_message)
        # Now create the answer and then cache + broadcast
        new_answer = Answer(
            answer_text = request.answer_text,
            has_buzzed = request.has_buzzed,
            timestamp = request.timestamp,
            player_id = player_id,
            match_id = match_id,
            question_id = question_id,
        )
        session.add(new_answer)
        await session.commit()

        # Cache the answer for fast reads and publish to match channel
        request_json = request.model_dump()
        try:
            await valkey.set(cache_key, json.dumps(request_json))
            broadcast_payload = {**request_json, "type": "answer"}
            await valkey.publish(channel=request.match_code, message=json.dumps(broadcast_payload))
            global_logger.info(f"Cached and published answer for key={cache_key}.")
        except Exception as e:
            # Log but do not fail the request since DB commit succeeded
            global_logger.error(f"Failed to cache/publish answer for key={cache_key}: {e}")

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
    global_logger.info(f"GET request to fetch answer for question {question_code} in match {match_code} from player {user_code}")
    try:
        cache_key = f"answer:{match_code}:{user_code}:{question_code}"
        cached = await valkey.get(cache_key)
        if cached is not None:
            record_json = json.loads(cached)
            log_message = f"Fetched an answer from cache for key={cache_key}."
            global_logger.info(log_message)
            return BaseResponse(
                status='success',
                message=log_message,
                data=record_json
            )
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
    global_logger.info(f"Soft deleting answer for question {question_code} in match {match_code} from player {user_code}")
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
            global_logger.error(log_message)
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
