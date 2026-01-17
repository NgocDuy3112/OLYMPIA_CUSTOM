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
    global_logger.info(f"POST request to add answer for question {request.question_code} in match {request.match_code}")
    try:
        request_json = request.model_dump()
        cache_key = f"answer:{request.match_code}:{request.player_code}:{request.question_code}"
        await valkey.json().set(cache_key, "$", request_json)
        await valkey.publish(channel=request.match_code, message=json.dumps(request_json))
        global_logger.info(f"Cached answer for key=answer:{request.match_code}:{request.player_code}:{request.question_code} with points={request.answer_text}.")
        # Find match ID
        match_id = await session.scalar(
            select(Match.id).where(
                Match.match_code == request.match_code
                and Match.is_deleted == False
            )
        )
        if match_id is None:
            log_message = f"Match with match_code={request.match_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        # Find player ID
        player_id = await session.scalar(
            select(User.id).where(
                User.user_code == request.player_code
                and User.is_deleted == False
            )
        )
        if player_id is None:
            log_message = f"Player with player_code={request.player_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        # Find question ID
        question_id = await session.scalar(
            select(Question.id).where(
                Question.question_code == request.question_code
                and Question.is_deleted == False
            )
        )
        if question_id is None:
            log_message = f"Question with question_code={request.question_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        # Now create the answer
        new_answer = Answer(
            answer_text = request.answer_text,
            has_buzzed = request.has_buzzed,
            player_id = player_id,
            match_id = match_id,
            question_id = question_id,
        )
        await session.add(new_answer)
        await session.commit()
        log_message = f"Successfully created answer for question_code={request.question_code} in match_code={request.match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status="success",
            message=log_message,
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"Integrity error when creating answer for question_code={request.question_code} in match_code={request.match_code}."
        global_logger.warning(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=409)
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"Failed to create answer: related match or question not found."
        global_logger.warning(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=404)
        )



async def get_answers_from_db(
    request: AnswerGetRequest, 
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    global_logger.info(f"GET request to fetch answers for question {request.question_code} in match {request.match_code}")
    try:
        cache_key = f"answer:{request.match_code}:{request.player_code}:{request.question_code}"
        if await valkey.exists(cache_key):
            record_json = await valkey.json().get(cache_key, "$", no_escape=True)
            log_message = f"Fetched an answer from cache for key={cache_key}."
            global_logger.info(log_message)
            return BaseResponse(
                status='success',
                message=log_message,
                data=record_json
            )
        result = await session.scalars(
            select(
                Answer
            ).join(
                Match, Answer.match_id == Match.id
            ).join(
                User, Answer.player_id == User.id
            ).join(
                Question, Answer.question_id == Question.id
            ).where(
                Match.match_code == request.match_code,
                User.user_code == request.player_code,
                Question.question_code == request.question_code
            )
        )
        answers = result.all()
        answers_data = [
            {
                'match_code': request.match_code,
                'question_code': request.question_code,
                'answer_text': answer.answer_text,
                'has_buzzed': answer.has_buzzed,
                'timestamp': float(answer.timestamp) if answer.timestamp is not None else None
            }
            for answer in answers
        ]
        log_message = f"Fetched {len(answers_data)} answers for question_code={request.question_code} in match_code={request.match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=answers_data 
        )
    except HTTPException:
        raise
    except Exception:
        log_message = f"Failed to fetch answers: related match or question not found."
        global_logger.warning(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=404)
        )