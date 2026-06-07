from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from logger import global_logger
from models.match import Match, MatchPlayerPosition
from models.user import User
from schemas.match import *



async def post_match_to_db(request: MatchInfoPostRequest, session: AsyncSession) -> BaseResponse:
    global_logger.debug(f"POST request received to create match with code: {request.match_code}.")
    try:
        # Check if match already exists
        match_query = select(Match).where(Match.match_code == request.match_code, Match.is_deleted == False)
        result = await session.execute(match_query)
        existing_match = result.scalar_one_or_none()
        if existing_match:
            log_message = f"A match with match_code={request.match_code} already exists."
            global_logger.warning(log_message)
            raise HTTPException(status_code=400, detail=log_message)

        # Create new match
        new_match = Match(
            match_code = request.match_code,
            match_name = request.match_name,
            match_status = request.match_status if getattr(request, 'match_status', None) is not None else 'setup'
        )
        session.add(new_match)
        await session.flush() # Get match id

        # Add players if provided
        if request.players:
            for p_assignment in request.players:
                # Find player by user_code
                user_query = select(User).where(User.user_code == p_assignment.user_code, User.is_deleted == False)
                user_res = await session.execute(user_query)
                user = user_res.scalar_one_or_none()

                if not user:
                    raise HTTPException(status_code=404, detail=f"Player with code {p_assignment.user_code} not found")

                match_player = MatchPlayerPosition(
                    match_id=new_match.id,
                    player_id=user.id,
                    position=p_assignment.position
                )
                session.add(match_player)

        await session.commit()
        await session.refresh(new_match)

        log_message = f"Match created successfully with {len(request.players) if request.players else 0} players. match_code={request.match_code}"
        global_logger.info(log_message)
        return BaseResponse(status='success', message=log_message)

    except HTTPException:
        await session.rollback()
        raise
    except IntegrityError as e:
        await session.rollback()
        log_message = f"Integrity error: {str(e)}"
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=400, detail="Match code or Player position already exists/occupied.")
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while creating match with match_code={request.match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def patch_match_to_db(
    match_code: str,
    request: MatchUpdateRequest,
    session: AsyncSession,
) -> BaseResponse:
    global_logger.debug(f"PATCH request received to update match with code: {match_code}.")
    try:
        result = await session.execute(
            select(Match).where(Match.match_code == match_code, Match.is_deleted == False)
        )
        match = result.scalar_one_or_none()
        if not match:
            log_message = f"No active match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        if request.match_name is not None:
            match.match_name = request.match_name

        if request.match_status is not None:
            match.match_status = request.match_status

        if request.players is not None:
            # Clear old room config
            old_positions_result = await session.execute(
                select(MatchPlayerPosition).where(MatchPlayerPosition.match_id == match.id)
            )
            old_positions = old_positions_result.scalars().all()
            for old_position in old_positions:
                await session.delete(old_position)
            await session.flush()

            # Validate request players payload before insert
            seen_positions: set[int] = set()
            seen_players: set[str] = set()
            for assignment in request.players:
                if assignment.position in seen_positions:
                    raise HTTPException(status_code=400, detail=f"Duplicate position={assignment.position} in players payload")
                if assignment.user_code in seen_players:
                    raise HTTPException(status_code=400, detail=f"Duplicate user_code={assignment.user_code} in players payload")
                seen_positions.add(assignment.position)
                seen_players.add(assignment.user_code)

            # Insert new room config
            for assignment in request.players:
                user_result = await session.execute(
                    select(User).where(User.user_code == assignment.user_code, User.is_deleted == False)
                )
                user = user_result.scalar_one_or_none()
                if not user:
                    raise HTTPException(status_code=404, detail=f"Player with code {assignment.user_code} not found")

                session.add(
                    MatchPlayerPosition(
                        match_id=match.id,
                        player_id=user.id,
                        position=assignment.position,
                    )
                )

        await session.commit()
        log_message = f"Match updated successfully. match_code={match_code}"
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message)
    except HTTPException:
        await session.rollback()
        raise
    except IntegrityError as e:
        await session.rollback()
        log_message = f"Integrity error while updating match_code={match_code}: {str(e)}"
        global_logger.warning(log_message, exc_info=True)
        raise HTTPException(status_code=400, detail="Invalid match update payload or duplicate values")
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while updating match with match_code={match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def delete_match_from_db(match_code: str, session: AsyncSession) -> BaseResponse:
    """Soft delete a match from DB by setting is_deleted=True."""
    global_logger.debug(f"Soft deleting match with match_code={match_code} from database.")
    try:
        query = select(Match).where(Match.match_code == match_code, Match.is_deleted == False)
        result = await session.execute(query)
        match = result.scalars().one_or_none()

        if match is None:
            log_message = f"No active match found with match_code={match_code} to delete."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        match.is_deleted = True
        await session.commit()

        log_message = f"Match with match_code={match_code} has been soft deleted successfully."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while deleting match with match_code={match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def get_match_by_match_code_from_db(match_code: str | None, session: AsyncSession) -> MatchRoomResponse:
    global_logger.debug(f"GET request received to fetch match room with code: {match_code}.")
    try:
        query = (
            select(Match)
            .options(selectinload(Match.players_position).joinedload(MatchPlayerPosition.user))
            .where(Match.match_code == match_code, Match.is_deleted == False)
        )
        result = await session.execute(query)
        match = result.scalar_one_or_none()
        
        if not match:
            raise HTTPException(status_code=404, detail=f"Match with code {match_code} not found")

        players_data = [
            MatchPlayerInRoom(
                user_code=pp.user.user_code,
                user_name=pp.user.user_name,
                position=pp.position
            )
            for pp in match.players_position
        ]
        # Sort by position
        players_data.sort(key=lambda x: x.position)

        matches_data = {
            'match_code': match.match_code,
            'match_name': match.match_name,
            'match_status': match.match_status,
            'players': [p.model_dump() for p in players_data]
        }
        
        log_message = f"Fetched match room successfully: match_code={match_code}."
        global_logger.info(log_message)
        return MatchRoomResponse(
            status='success',
            message=log_message,
            data=matches_data 
        )
    except HTTPException:
        raise
    except Exception:
        log_message = f"An unexpected error occurred while fetching match room with match_code={match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def get_all_matches_from_db(session: AsyncSession) -> BaseResponse:
    """Return all non-deleted matches ordered by creation date descending."""
    global_logger.debug("GET request received to fetch all active matches.")
    try:
        query = select(Match).where(Match.is_deleted == False).order_by(Match.created_at.desc())
        result = await session.execute(query)
        matches = result.scalars().all()
        data = [
            {
                "match_code": m.match_code,
                "match_name": m.match_name,
                "match_status": m.match_status,
            }
            for m in matches
        ]
        log_message = f"Fetched {len(matches)} active matches."
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message, data=data)
    except Exception:
        log_message = "An unexpected error occurred while fetching all matches."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def finish_match_in_db(match_code: str, session: AsyncSession) -> BaseResponse:
    """Mark a match as finished. Once finished, the match becomes read-only."""
    global_logger.debug(f"PATCH request received to finish match with code: {match_code}.")
    try:
        result = await session.execute(
            select(Match).where(Match.match_code == match_code, Match.is_deleted == False)
        )
        match = result.scalar_one_or_none()
        if not match:
            log_message = f"No active match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        if match.match_status == 'finished':
            log_message = f"Match {match_code} is already finished."
            global_logger.info(log_message)
            return BaseResponse(status="success", message=log_message)

        match.match_status = 'finished'
        await session.commit()

        log_message = f"Match {match_code} has been marked as finished."
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while finishing match {match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


# helper to just return players list
async def get_players_by_match_from_db(match_code: str, session: AsyncSession) -> BaseResponse:
    global_logger.debug(f"GET request received to fetch players for match_code={match_code}.")
    try:
        query = (
            select(Match)
            .options(selectinload(Match.players_position).joinedload(MatchPlayerPosition.user))
            .where(Match.match_code == match_code, Match.is_deleted == False)
        )
        result = await session.execute(query)
        match = result.scalar_one_or_none()
        if not match:
            raise HTTPException(status_code=404, detail=f"Match with code {match_code} not found")

        players_data = [
            MatchPlayerInRoom(
                user_code=pp.user.user_code,
                user_name=pp.user.user_name,
                position=pp.position,
            )
            for pp in match.players_position
        ]
        players_data.sort(key=lambda x: x.position)

        log_message = f"Fetched {len(players_data)} players for match_code={match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status="success",
            message=log_message,
            data={"players": [player.model_dump() for player in players_data]},
        )
    except HTTPException:
        raise
    except Exception:
        log_message = f"An unexpected error occurred while fetching players for match_code={match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)
