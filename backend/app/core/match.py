from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from models.match import Match
from schemas.match import *



async def post_match_to_db(request: MatchInfoPostRequest, session: AsyncSession) -> BaseResponse:
    global_logger.info(f"POST request received to create match with code: {request.match_code}.")
    try:
        match_id = select(Match).where(Match.match_code == request.match_code)
        result = await session.execute(match_id)
        existing_match = result.scalar_one_or_none()
        if existing_match:
            log_message = f"A match with match_code={request.match_code} already exists."
            global_logger.warning(log_message)
            return BaseResponse(
                status='error',
                message=log_message
            )
        new_match = Match(
            match_code = request.match_code,
            match_name = request.match_name
        )
        session.add(new_match)
        global_logger.debug(f"Match object created and added to session. match_code={request.match_code}")
        await session.commit()
        await session.refresh(new_match)
        log_message = f"Match created successfully. match_code={request.match_code}"
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"A match with match_code={request.match_code} already exists."
        global_logger.warning(log_message)
        return BaseResponse(
            status='error',
            message=log_message
        )
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while creating match with match_code={request.match_code}."
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message
        )


async def get_match_by_match_code_from_db(match_code: str | None, session: AsyncSession) -> BaseResponse:
    global_logger.info(f"GET request received to fetch matches with code: {match_code}.")
    try:
        query = select(Match).where(Match.match_code == match_code)
        result = await session.execute(query)
        match = result.scalar_one_or_none()
        matches_data = {
            'match_code': match.match_code,
            'match_name': match.match_name
        }
        log_message = f"Fetched 1 match from the database with match_code={match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=matches_data 
        )
    except HTTPException:
        raise
    except Exception:
        log_message = f"An unexpected error occurred while fetching matches with match_code={match_code}."
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message
        )