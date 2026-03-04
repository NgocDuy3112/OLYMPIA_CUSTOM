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
    log_message = f"POST request received to create record for user_code: {request.user_code}, match_code: {request.match_code}, question_code: {request.question_code}."
    global_logger.info(log_message)
    try:
        # Save to cache for later queries
        await valkey.zadd(f"leaderboard:{request.match_code}", {request.user_code: request.points}, incr=True)
        global_logger.info(f"Cached record to the leaderboard for key=record:{request.match_code}:{request.user_code}:{request.question_code} with points={request.points}.")
        # Find user ID
        user_id = await session.scalar(
            select(User.id).where(
                User.user_code == request.user_code,
                User.role == RoleEnum.player,
                User.is_deleted == False,
            )
        )
        if user_id is None:
            log_message = f"Player with user_code={request.user_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        # Find match ID
        match_id = await session.scalar(
            select(Match.id).where(
                Match.match_code == request.match_code,
                Match.is_deleted == False,
            )
        )
        if match_id is None:
            log_message = f"Match with match_code={request.match_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        # Find question ID
        question_id = await session.scalar(
            select(Question.id).where(
                Question.question_code == request.question_code,
                Question.is_deleted == False,
            )
        )
        if question_id is None:
            log_message = f"Question with question_code={request.question_code} does not exist."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        # Now create the record
        new_record = Record(
            player_id = user_id,
            match_id = match_id,
            question_id = question_id,
            points = request.points,
        )
        session.add(new_record)
        await session.commit()
        await session.refresh(new_record)
        log_message = f"Record created successfully for user_code={request.user_code}, match_code={request.match_code}, question_code={request.question_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Error creating record for user_code={request.user_code}, match_code={request.match_code}, question_code={request.question_code}: {str(e)}"
        await session.rollback()
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def get_records_from_db(
    match_code: str,
    user_code: str,
    session: AsyncSession
) -> BaseResponse:
    log_message = f"GET request received to fetch records for user_code: {user_code}, match_code: {match_code}."
    global_logger.info(log_message)
    try:
        # Build the query
        query = select(
            Record
        ).join(
            User, Record.player_id == User.id
        ).join(
            Match, Record.match_id == Match.id
        ).where(
            User.user_code == user_code,
            Match.match_code == match_code,
            User.is_deleted == False,
            Match.is_deleted == False,
            Record.is_deleted == False
        )
        result = await session.execute(query)
        records = result.scalars().all()
        log_message = f"Fetched {len(records)} records for user_code={user_code}, match_code={match_code}."
        global_logger.info(log_message)

        # Convert SQLAlchemy model instances to plain dicts for pydantic serialization
        records_list: list[dict[str, object]] = []
        for r in records:
            records_list.append({
                "id": str(r.id) if getattr(r, 'id', None) is not None else None,
                "created_at": r.created_at.isoformat() if getattr(r, 'created_at', None) is not None else None,
                "updated_at": r.updated_at.isoformat() if getattr(r, 'updated_at', None) is not None else None,
                "points": r.points,
                "is_deleted": r.is_deleted,
                "player_id": str(r.player_id) if getattr(r, 'player_id', None) is not None else None,
                "match_id": str(r.match_id) if getattr(r, 'match_id', None) is not None else None,
                "question_id": str(r.question_id) if getattr(r, 'question_id', None) is not None else None,
            })

        return BaseResponse(
            status='success',
            message=log_message,
            data=records_list
        )
    except Exception as e:
        log_message = f"Error fetching records for user_code={user_code}, match_code={match_code}: {str(e)}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)