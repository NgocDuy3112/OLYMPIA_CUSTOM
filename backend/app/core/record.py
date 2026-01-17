from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from valkey.asyncio import Valkey

from logger import global_logger
from models.record import Record
from models.user import User, RoleEnum
from models.question import Question
from models.match import Match
from schemas.record import *




async def post_record_to_db(
    request: RecordPostRequest, 
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    log_message = f"POST request received to create record for player_code: {request.player_code}, match_code: {request.match_code}, question_code: {request.question_code}."
    global_logger.info(log_message)
    try:
        # Save to cache for later queries
        await valkey.zadd(f"leaderboard:{request.match_code}", {request.player_code: request.points}, incr=True)
        global_logger.info(f"Cached record to the leaderboard for key=record:{request.match_code}:{request.player_code}:{request.question_code} with points={request.points}.")
        # Find user ID
        user_id = await session.scalar(
            select(User.id).where(
                User.user_code == request.player_code 
                and User.role == RoleEnum.player
                and User.is_deleted == False
            )
        )
        if user_id is None:
            log_message = f"Player with player_code={request.player_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
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
        # Now create the record
        new_record = Record(
            user_id = user_id,
            match_id = match_id,
            question_id = question_id,
            points = request.points,
        )
        await session.commit()
        await session.refresh(new_record)
        log_message = f"Record created successfully for player_code={request.player_code}, match_code={request.match_code}, question_code={request.question_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Error creating record for player_code={request.player_code}, match_code={request.match_code}, question_code={request.question_code}: {str(e)}"
        await session.rollback()
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=e
        )


async def get_records_from_db(
    request: RecordGetRequest, 
    session: AsyncSession
) -> BaseResponse:
    log_message = f"GET request received to fetch records for player_code: {request.player_code}, match_code: {request.match_code}, question_code: {request.question_code}."
    global_logger.info(log_message)
    try:
        # Build the query
        query = select(
            Record
        ).join(
            User, Record.player_id == User.id
        ).join(
            Match, Record.match_id == Match.id
        ).join(
            Question, Record.question_id == Question.id
        ).where(
            User.user_code == request.player_code,
            Match.match_code == request.match_code,
            User.is_deleted == False,
            Match.is_deleted == False,
            Record.is_deleted == False
        )
        if request.question_code is not None:
            query = query.where(Question.question_code == request.question_code, Question.is_deleted == False)
        result = await session.execute(query)
        records = result.scalars().all()
        log_message = f"Fetched {len(records)} records for player_code={request.player_code}, match_code={request.match_code}, question_code={request.question_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=records
        )
    except Exception as e:
        log_message = f"Error fetching records for player_code={request.player_code}, match_code={request.match_code}, question_code={request.question_code}: {str(e)}"
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=e
        )