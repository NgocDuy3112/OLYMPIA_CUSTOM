from valkey.asyncio import Valkey
import json
from fastapi import HTTPException

from logger import global_logger
from schemas.base import BaseResponse
from schemas.scoreboard import ScoreAdjustRequest
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models.match import Match, MatchPlayerPosition
from models.user import User, RoleEnum
from models.record import Record
from models.question import Question
from utils.ws_connection import manager


def _safe_convert_score(value) -> int:
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
    log_message = f"GET request received to fetch scoreboard for match_code: {match_code}."
    global_logger.info(log_message)
    
    try:
        leaderboard_key = f"leaderboard:{match_code}"

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

        players_data = [
            {
                "user_code": pp.user.user_code,
                "user_name": pp.user.user_name,
                "position": pp.position,
            }
            for pp in match.players_position
        ]
        players_data.sort(key=lambda x: x["position"])
        
        player_codes = [p["user_code"] for p in players_data]

        if await valkey.exists(leaderboard_key):
            try:
                scores = await valkey.zmscore(leaderboard_key, player_codes) or []
            except Exception:
                scores = []
            scores = list(scores) + [None] * (len(player_codes) - len(scores))
            scoreboard_list = [
                {
                    "user_code": p["user_code"],
                    "user_name": p["user_name"],
                    "cumulative_score": _safe_convert_score(score),
                }
                for p, score in zip(players_data, scores)
            ]
            global_logger.debug(f"Fetched scoreboard from cache for match_code={match_code}.")
        else:
            scoreboard_list = [
                {
                    "user_code": p["user_code"],
                    "user_name": p["user_name"],
                    "cumulative_score": 0,
                }
                for p in players_data
            ]
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


async def update_player_question_score(
    request: ScoreAdjustRequest,
    valkey: Valkey,
    session: AsyncSession,
) -> BaseResponse:
    if request.question_code is None or request.points is None:
        raise HTTPException(status_code=422, detail="question_code and points are required")

    match_id = await session.scalar(select(Match.id).where(Match.match_code == request.match_code, Match.is_deleted == False))
    player_id = await session.scalar(select(User.id).where(User.user_code == request.user_code, User.role == RoleEnum.player, User.is_deleted == False))
    question = await session.scalar(select(Question).where(Question.match_id == match_id, Question.question_code == request.question_code, Question.is_deleted == False))
    if match_id is None or player_id is None or question is None:
        raise HTTPException(status_code=404, detail="Match, player, or question not found")

    record = await session.scalar(select(Record).where(
        Record.match_id == match_id,
        Record.player_id == player_id,
        Record.question_id == question.id,
        Record.is_deleted == False,
    ).order_by(Record.created_at.asc()))
    if record is None:
        record = Record(
            player_id=player_id,
            match_id=match_id,
            question_id=question.id,
            question_code=request.question_code,
            points=request.points,
        )
        session.add(record)
    else:
        record.points = request.points
        record.question_code = request.question_code

    await session.flush()
    await session.commit()
    total = await session.scalar(select(func.coalesce(func.sum(Record.points), 0)).where(
        Record.match_id == match_id,
        Record.player_id == player_id,
        Record.is_deleted == False,
    ))
    total = int(total or 0)
    await valkey.zadd(f"leaderboard:{request.match_code}", {request.user_code: total})

    scoreboard = await get_scoreboard_for_a_match_from_db(request.match_code, valkey, session)
    chart_rows = await session.execute(
        select(Record, User.user_code).join(User, Record.player_id == User.id).where(
            Record.match_id == match_id,
            Record.is_deleted == False,
            User.is_deleted == False,
        ).order_by(Record.created_at.asc())
    )
    chart_data: dict[str, list[dict[str, object]]] = {}
    chart_totals: dict[str, int] = {}
    adjustments: dict[str, int] = {}
    for row in chart_rows.all():
        item = row[0]
        code = row[1]
        if item.question_code == "OC3_Q_ADMIN_ADJUST":
            adjustments[code] = adjustments.get(code, 0) + item.points
            continue
        chart_totals[code] = chart_totals.get(code, 0) + item.points
        chart_data.setdefault(code, []).append({
            "question_code": item.question_code,
            "points": item.points,
            "cumulative_score": chart_totals[code],
            "created_at": item.created_at.isoformat() if item.created_at else None,
        })
    for code, adjustment in adjustments.items():
        if adjustment:
            chart_totals[code] = chart_totals.get(code, 0) + adjustment
            chart_data.setdefault(code, []).append({
                "question_code": "ADJUST",
                "points": adjustment,
                "cumulative_score": chart_totals[code],
                "created_at": None,
            })
    question_rows = await session.execute(select(Question.question_code).where(Question.match_id == match_id, Question.is_deleted == False).order_by(Question.created_at.asc()))
    question_labels = [row[0] for row in question_rows.all()]
    payload = {
        "type": "score_chart_snapshot",
        "question_labels": question_labels,
        "match_code": request.match_code,
        "scoreboard": (scoreboard.data or {}).get("scoreboard", []),
        "chart_data": chart_data,
        "updated_user_code": request.user_code,
        "question_code": request.question_code,
        "points": request.points,
    }
    await manager.broadcast_to_room(request.match_code, payload)
    return scoreboard


async def adjust_player_score(
    request: ScoreAdjustRequest,
    valkey: Valkey,
    session: AsyncSession,
) -> BaseResponse:
    match_code = request.match_code
    user_code = request.user_code
    if request.question_code is not None:
        return await update_player_question_score(request, valkey, session)

    new_score = request.new_score
    reason = request.reason or "admin_adjust"

    log_message = f"Score adjust request: user_code={user_code}, match_code={match_code}, new_score={new_score}, reason={reason}"
    global_logger.info(log_message)

    try:
        match = await session.scalar(
            select(Match.id).where(
                Match.match_code == match_code,
                Match.is_deleted == False,
            )
        )
        if match is None:
            raise HTTPException(status_code=404, detail=f"Match {match_code} not found")

        user = await session.scalar(
            select(User.id).where(
                User.user_code == user_code,
                User.role == RoleEnum.player,
                User.is_deleted == False,
            )
        )
        if user is None:
            raise HTTPException(status_code=404, detail=f"Player {user_code} not found")

        leaderboard_key = f"leaderboard:{match_code}"
        current_score = await valkey.zscore(leaderboard_key, user_code)
        current_score = _safe_convert_score(current_score)

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
            new_q = QuestionModel(
                question_code="OC3_Q_ADMIN_ADJUST",
                content="(Admin score adjustment)",
                answer="N/A",
                match_id=match,
            )
            session.add(new_q)
            await session.flush()
            adjust_question = new_q.id

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