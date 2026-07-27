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
    global_logger.debug(log_message)
    try:
        await valkey.zadd(f"leaderboard:{request.match_code}", {request.user_code: request.points}, incr=True)

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
    user_code: str | None,
    session: AsyncSession
) -> BaseResponse:

    log_message = f"GET request received to fetch records for user_code: {user_code}, match_code: {match_code}."
    global_logger.debug(log_message)
    try:
        stmt = (
            select(
                Record,
                User.user_code.label("u_code"),
                Match.match_code.label("m_code"),
                Question.question_code.label("q_code"),
            )
            .join(User, Record.player_id == User.id)
            .join(Match, Record.match_id == Match.id)
            .join(Question, Record.question_id == Question.id)
            .where(
                Match.match_code == match_code,
                User.is_deleted == False,
                Match.is_deleted == False,
                Record.is_deleted == False,
            )
        )
        if user_code is not None:
            stmt = stmt.where(User.user_code == user_code)
        stmt = stmt.order_by(Record.created_at.asc())

        result = await session.execute(stmt)
        rows = result.all()

        records_list: list[dict[str, object]] = []
        for row in rows:
            r = row[0]
            records_list.append({
                "user_code": row.u_code,
                "match_code": row.m_code,
                "question_code": row.q_code,
                "points": r.points,
                "round_number": r.round_number,
                "created_at": r.created_at.isoformat() if getattr(r, 'created_at', None) is not None else None,
                "updated_at": r.updated_at.isoformat() if getattr(r, 'updated_at', None) is not None else None,
            })

        global_logger.debug(
            f"Fetched {len(records_list)} records for user_code={user_code}, match_code={match_code}."
        )

        return BaseResponse(
            status='success',
            message=log_message,
            data=records_list
        )
    except Exception as e:
        log_message = f"Error fetching records for user_code={user_code}, match_code={match_code}: {str(e)}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)