from valkey.asyncio import Valkey
import json
from fastapi import HTTPException

from logger import global_logger
from schemas.base import BaseResponse
from schemas.scoreboard import ScoreAdjustRequest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.match import Match, MatchPlayerPosition
from models.user import User, RoleEnum


def _safe_convert_score(value) -> int:
    """Helper function to safely convert score from Valkey to int."""
    if value is None:
        return 0
    try:
        return int(value)
    except (ValueError, TypeError):
        try:
            return int(float(value))
        except (ValueError, TypeError):
            return 0


async def get_scoreboard_for_a_match_from_db(
    match_code: str,
    valkey: Valkey,
    session: AsyncSession,
) -> BaseResponse:
    """Return full scoreboard for a match. Prioritizes Valkey cache."""
    log_message = f"GET request received to fetch scoreboard for match_code: {match_code}."
    global_logger.info(log_message)
    
    try:
        leaderboard_key = f"leaderboard:{match_code}"
        
        # Step 1: Query DB to get player info
        query = (
            select(Match)
            .options(selectinload(Match.players_position).joinedload(MatchPlayerPosition.user))
            .where(Match.match_code == match_code, Match.is_deleted == False)
        )
        result = await session.execute(query)
        match = result.scalar_one_or_none()
        if not match:
            log_message = f"Match with code {match_code} not found"
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # Step 2: Build players data and sort by position
        players_data = [
            {
                "user_code": pp.user.user_code,
                "user_name": pp.user.user_name,
                "position": pp.position,
            }
            for pp in match.players_position
        ]
        players_data.sort(key=lambda x: x["position"])
        
        # Step 3: Fetch all scores from Valkey in one operation
        player_codes = [p["user_code"] for p in players_data]
        
        if await valkey.exists(leaderboard_key):
            # The leaderboard is stored as a sorted set (zset) under the leaderboard_key.
            # Use ZSCORE per player to retrieve their cumulative score. We intentionally
            # avoid mget here because scores are stored as zset member scores, not as
            # separate string keys.
            scoreboard_list = []
            for p in players_data:
                try:
                    score = await valkey.zscore(leaderboard_key, p["user_code"])  # may return None
                except Exception:
                    score = None
                scoreboard_list.append(
                    {
                        "user_code": p["user_code"],
                        "user_name": p["user_name"],
                        "cumulative_score": _safe_convert_score(score),
                    }
                )
            # Demoted to DEBUG — admin GET /scoreboard/ is called every few
            # seconds while the round is live. INFO here was one line per
            # poll, drowning out buzz / scoring events.
            global_logger.debug(f"Fetched scoreboard from cache for match_code={match_code}.")
        else:
            # No leaderboard in cache -> return zeros for all players
            scoreboard_list = [
                {
                    "user_code": p["user_code"],
                    "user_name": p["user_name"],
                    "cumulative_score": 0,
                }
                for p in players_data
            ]
            # Keep at INFO — first hit on a brand-new match is genuinely useful
            # to confirm the cold-start path works.
            global_logger.info(f"No leaderboard cache found; returning zeroed scoreboard for match_code={match_code}.")

        return BaseResponse(
            status="success",
            message=log_message,
            data={"scoreboard": scoreboard_list},
        )
        
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Error fetching scoreboard for match_code={match_code}: {str(e)}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def adjust_player_score(
    request: ScoreAdjustRequest,
    valkey: Valkey,
    session: AsyncSession,
) -> BaseResponse:
    """Set a player's cumulative score to a specific value.

    This works by:
    1. Reading the current score from Valkey (ZSCORE).
    2. Computing the delta needed to reach the target.
    3. Applying the delta via ZADD INCR so the leaderboard stays consistent.
    4. Creating a Record row in PostgreSQL for audit purposes.
    """
    match_code = request.match_code
    user_code = request.user_code
    new_score = request.new_score
    reason = request.reason or "admin_adjust"

    log_message = f"Score adjust request: user_code={user_code}, match_code={match_code}, new_score={new_score}, reason={reason}"
    global_logger.info(log_message)

    try:
        # ── 1. Validate match exists ──────────────────────────────────
        match = await session.scalar(
            select(Match.id).where(
                Match.match_code == match_code,
                Match.is_deleted == False,
            )
        )
        if match is None:
            raise HTTPException(status_code=404, detail=f"Match {match_code} not found")

        # ── 2. Validate player exists ────────────────────────────────
        user = await session.scalar(
            select(User.id).where(
                User.user_code == user_code,
                User.role == RoleEnum.player,
                User.is_deleted == False,
            )
        )
        if user is None:
            raise HTTPException(status_code=404, detail=f"Player {user_code} not found")

        # ── 3. Read current score from Valkey ────────────────────────
        leaderboard_key = f"leaderboard:{match_code}"
        current_score = await valkey.zscore(leaderboard_key, user_code)
        current_score = _safe_convert_score(current_score)

        # ── 4. Compute delta and apply ───────────────────────────────
        delta = new_score - current_score
        if delta != 0:
            await valkey.zadd(leaderboard_key, {user_code: delta}, incr=True)
            global_logger.info(
                f"Score adjusted: {user_code} in {match_code}: "
                f"{current_score} → {new_score} (delta={delta})"
            )
        else:
            global_logger.info(
                f"Score unchanged: {user_code} in {match_code} already at {new_score}"
            )

        # ── 5. Create audit Record in PostgreSQL ─────────────────────
        # Find or create a special "admin_adjust" question for this match
        from models.question import Question as QuestionModel
        from models.record import Record as RecordModel

        adjust_question = await session.scalar(
            select(QuestionModel.id).where(
                QuestionModel.question_code == "OC3_Q_ADMIN_ADJUST",
                QuestionModel.match_id == match,
                QuestionModel.is_deleted == False,
            )
        )
        if adjust_question is None:
            # Auto-create the placeholder question if it doesn't exist
            new_q = QuestionModel(
                question_code="OC3_Q_ADMIN_ADJUST",
                content="(Admin score adjustment)",
                answer="N/A",
                match_id=match,
            )
            session.add(new_q)
            await session.flush()
            adjust_question = new_q.id

        # Record the delta (round to nearest 5 to satisfy CHECK constraint)
        rounded_delta = round(delta / 5) * 5
        if rounded_delta != 0:
            record = RecordModel(
                player_id=user,
                match_id=match,
                question_id=adjust_question,
                points=rounded_delta,
                question_code="OC3_Q_ADMIN_ADJUST",
            )
            session.add(record)
            await session.commit()
        else:
            await session.commit()

        updated_scoreboard = await get_scoreboard_for_a_match_from_db(
            match_code, valkey, session
        )
        global_logger.info(f"Scoreboard: {updated_scoreboard}")
        return updated_scoreboard

    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Error adjusting score for user_code={user_code}, match_code={match_code}: {str(e)}"
        global_logger.exception(log_message)
        await session.rollback()
        raise HTTPException(status_code=500, detail=log_message)