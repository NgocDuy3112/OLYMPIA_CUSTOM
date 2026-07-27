import json
import uuid

from sqlalchemy import func, case, and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from valkey.asyncio import Valkey

from logger import global_logger
from models.answer import Answer
from models.match import Match
from models.question import Question
from models.user import User
from models.qualifier_record import QualifierRecord
from models.qualifier_advancement import QualifierAdvancement
from schemas.qualifier import QualifierScoreRequest
from schemas.base import BaseResponse


_QUALIFIER_LEADERBOARD_KEY = "qualifier_leaderboard:{match_code}:{round_number}"
_QUALIFIER_CORRECT_SCORE_KEY = "qualifier_correct_score:{match_code}:{round_number}"
_QUALIFIER_RESPONSE_TIME_KEY = "qualifier_response_time:{match_code}:{round_number}"
_QUALIFIER_RESPONSE_COUNT_KEY = "qualifier_response_count:{match_code}:{round_number}"


async def _rebuild_qualifier_leaderboard_from_db(
    match_code: str,
    round_number: int,
    session: AsyncSession,
    valkey: Valkey,
) -> None:
    match_id = await session.scalar(
        select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False)
    )
    if match_id is None:
        return

    result = await session.execute(
        select(
            User.user_code,
            func.sum(QualifierRecord.points).label("total_points"),
            func.sum(
                case(
                    (
                        and_(QualifierRecord.is_correct == True, QualifierRecord.points > 0),
                        QualifierRecord.points,
                    ),
                    else_=0,
                )
            ).label("correct_points"),
            func.sum(
                case(
                    (
                        and_(
                            QualifierRecord.is_correct == True,
                            QualifierRecord.points > 0,
                            QualifierRecord.response_time.isnot(None),
                        ),
                        QualifierRecord.response_time,
                    ),
                    else_=None,
                )
            ).label("rt_sum"),
            func.count(
                case(
                    (
                        and_(QualifierRecord.is_correct == True, QualifierRecord.points > 0),
                        1,
                    ),
                    else_=None,
                )
            ).label("rc"),
        )
        .join(QualifierRecord, QualifierRecord.player_id == User.id)
        .where(
            QualifierRecord.match_id == match_id,
            QualifierRecord.round_number == round_number,
            QualifierRecord.is_deleted == False,
        )
        .group_by(User.user_code)
    )
    rows = result.all()
    if not rows:
        return

    leaderboard_key = _QUALIFIER_LEADERBOARD_KEY.format(match_code=match_code, round_number=round_number)
    correct_key = _QUALIFIER_CORRECT_SCORE_KEY.format(match_code=match_code, round_number=round_number)
    rt_key = _QUALIFIER_RESPONSE_TIME_KEY.format(match_code=match_code, round_number=round_number)
    rc_key = _QUALIFIER_RESPONSE_COUNT_KEY.format(match_code=match_code, round_number=round_number)

    for user_code, total_points, correct_points, rt_sum, rc in rows:
        await valkey.zadd(leaderboard_key, {user_code: float(total_points or 0)})
        cp = float(correct_points or 0)
        if cp > 0:
            await valkey.zadd(correct_key, {user_code: cp})
        if rt_sum is not None:
            await valkey.zadd(rt_key, {user_code: float(rt_sum)})
        if rc:
            await valkey.zadd(rc_key, {user_code: float(rc)})

    global_logger.info(
        f"Rebuilt qualifier leaderboard for match={match_code} round={round_number} "
        f"from DB: {len(rows)} players."
    )


async def calculate_and_apply_qualifier_scores(
    request: QualifierScoreRequest,
    session: AsyncSession,
    valkey: Valkey,
) -> BaseResponse:
    log_message = (
        f"Qualifier score calculation for match={request.match_code} "
        f"question={request.question_code} round={request.round_number}"
    )
    global_logger.info(log_message)

    try:
        match_id = await session.scalar(
            select(Match.id).where(
                Match.match_code == request.match_code,
                Match.is_deleted == False,
            )
        )
        if match_id is None:
            raise HTTPException(status_code=404, detail=f"Match {request.match_code} not found.")

        question = await session.scalar(
            select(Question).where(
                Question.question_code == request.question_code,
                Question.is_deleted == False,
            )
        )
        if question is None:
            raise HTTPException(status_code=404, detail=f"Question {request.question_code} not found.")

        result = await session.execute(
            select(User.id, User.user_code).where(
                User.is_deleted == False,
                User.role == "player",
            )
        )
        all_players = result.all()
        total_players = len(all_players)

        answers_by_player: dict[str, tuple[str | None, float | None]] = {}
        for player_id, player_code in all_players:
            cache_key = f"answer:{request.match_code}:{player_code}:{request.question_code}"
            cached = await valkey.get(cache_key)
            if cached is not None:
                cached_data = json.loads(cached)
                answers_by_player[player_code] = (
                    cached_data.get("answer_text"),
                    cached_data.get("timestamp"),
                )
            else:
                db_result = await session.execute(
                    select(Answer.answer_text, Answer.timestamp).where(
                        Answer.player_id == player_id,
                        Answer.match_id == match_id,
                        Answer.question_id == question.id,
                        Answer.is_deleted == False,
                    ).order_by(Answer.created_at.desc())
                )
                row = db_result.first()
                if row is not None:
                    answers_by_player[player_code] = (
                        row.answer_text,
                        float(row.timestamp) if row.timestamp is not None else None,
                    )

        correct_players: list[tuple[str, float | None]] = []
        wrong_players: list[tuple[str, float | None]] = []
        no_answer_players: list[str] = []

        for _, player_code in all_players:
            entry = answers_by_player.get(player_code)
            if entry is None:
                no_answer_players.append(player_code)
                continue
            answer_text, timestamp = entry
            if answer_text is None:
                no_answer_players.append(player_code)
            elif answer_text.upper() == request.correct_answer:
                correct_players.append((player_code, timestamp))
            else:
                wrong_players.append((player_code, timestamp))

        x = len(correct_players)
        y = len(wrong_players) + len(no_answer_players)

        global_logger.info(
            f"Question {request.question_code}: x(correct)={x}, "
            f"wrong={len(wrong_players)}, no_answer={len(no_answer_players)}, y={y}"
        )

        score_entries: list[tuple[str, int, float | None, bool]] = []

        for player_code, timestamp in correct_players:
            score_entries.append((player_code, y, timestamp, True))
        for player_code, timestamp in wrong_players:
            score_entries.append((player_code, -x, timestamp, False))
        for player_code in no_answer_players:
            score_entries.append((player_code, -x, None, False))

        player_id_map: dict[str, "uuid.UUID"] = {
            str(code): uid for uid, code in all_players
        }

        new_records: list[QualifierRecord] = []
        for player_code, delta, resp_time, is_correct in score_entries:
            player_db_id = player_id_map.get(player_code)
            if player_db_id is None:
                global_logger.warning(f"Player id not found for code={player_code}; skipping record.")
                continue
            raw_chosen = answers_by_player.get(player_code, (None, None))[0]
            chosen = raw_chosen[0].upper() if raw_chosen else None
            new_records.append(
                QualifierRecord(
                    player_id=player_db_id,
                    match_id=match_id,
                    question_id=question.id,
                    points=delta,
                    response_time=resp_time,
                    is_correct=is_correct,
                    round_number=request.round_number,
                    chosen_option=chosen,
                )
            )

        leaderboard_key = _QUALIFIER_LEADERBOARD_KEY.format(
            match_code=request.match_code, round_number=request.round_number
        )
        correct_key = _QUALIFIER_CORRECT_SCORE_KEY.format(
            match_code=request.match_code, round_number=request.round_number
        )

        if not await valkey.exists(leaderboard_key):
            await _rebuild_qualifier_leaderboard_from_db(
                request.match_code, request.round_number, session, valkey
            )

        if new_records:
            session.add_all(new_records)
            await session.commit()

        score_updates: list[dict] = []
        for player_code, delta, resp_time, is_correct in score_entries:
            await valkey.zadd(leaderboard_key, {player_code: delta}, incr=True)
            new_total = await valkey.zscore(leaderboard_key, player_code)

            if is_correct and y > 0:
                await valkey.zadd(correct_key, {player_code: delta}, incr=True)
                rt_key = _QUALIFIER_RESPONSE_TIME_KEY.format(
                    match_code=request.match_code, round_number=request.round_number
                )
                rc_key = _QUALIFIER_RESPONSE_COUNT_KEY.format(
                    match_code=request.match_code, round_number=request.round_number
                )
                if resp_time is not None:
                    await valkey.zadd(rt_key, {player_code: resp_time}, incr=True)
                    await valkey.zadd(rc_key, {player_code: 1}, incr=True)

            score_updates.append(
                {
                    "user_code": player_code,
                    "delta": delta,
                    "new_total": int(new_total) if new_total is not None else 0,
                    "is_correct": is_correct,
                }
            )

        broadcast_payload = {
            "type": "qualifier_scores_updated",
            "question_code": request.question_code,
            "correct_answer": request.correct_answer,
            "correct_count": x,
            "wrong_count": len(wrong_players),
            "no_answer_count": len(no_answer_players),
            "score_updates": score_updates,
        }
        try:
            await valkey.publish(channel=request.match_code, message=json.dumps(broadcast_payload))
        except Exception:
            global_logger.exception(
                f"Failed to broadcast qualifier scores via Valkey for question={request.question_code}; "
                "scores are already persisted in DB."
            )

        log_message = (
            f"Qualifier scores applied for question={request.question_code}: "
            f"x(correct)={x}, y(wrong+no_answer)={y}, records={len(new_records)}."
        )
        global_logger.info(log_message)
        return BaseResponse(
            status="success",
            message=log_message,
            data={
                "correct_count": x,
                "wrong_count": len(wrong_players),
                "no_answer_count": len(no_answer_players),
                "score_updates": score_updates,
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        log_message = f"Unexpected error during qualifier score calculation: {e}"
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=log_message)


async def get_qualifier_standings(
    match_code: str,
    round_number: int,
    session: AsyncSession,
    valkey: Valkey,
) -> BaseResponse:
    log_message = f"GET qualifier standings for match_code={match_code} round={round_number}."
    global_logger.info(log_message)

    try:
        leaderboard_key = _QUALIFIER_LEADERBOARD_KEY.format(match_code=match_code, round_number=round_number)
        correct_key = _QUALIFIER_CORRECT_SCORE_KEY.format(match_code=match_code, round_number=round_number)
        rt_key = _QUALIFIER_RESPONSE_TIME_KEY.format(match_code=match_code, round_number=round_number)
        rc_key = _QUALIFIER_RESPONSE_COUNT_KEY.format(match_code=match_code, round_number=round_number)

        raw = await valkey.zrangebyscore(leaderboard_key, "-inf", "+inf", withscores=True)
        if not raw:
            await _rebuild_qualifier_leaderboard_from_db(match_code, round_number, session, valkey)
            raw = await valkey.zrangebyscore(leaderboard_key, "-inf", "+inf", withscores=True)

        user_name_map: dict[str, str] = {}
        if raw:
            codes = [item[0].decode() if isinstance(item[0], bytes) else item[0] for item in raw]
            result = await session.execute(
                select(User.user_code, User.user_name).where(
                    User.user_code.in_(codes),
                    User.is_deleted == False,
                )
            )
            user_name_map = {row.user_code: row.user_name for row in result}

        standings: list[dict] = []
        for entry in raw:
            player_code = entry[0].decode() if isinstance(entry[0], bytes) else entry[0]
            total_score = int(float(entry[1]))

            correct_score_raw = await valkey.zscore(correct_key, player_code)
            correct_score = int(float(correct_score_raw)) if correct_score_raw is not None else 0

            rt_sum_raw = await valkey.zscore(rt_key, player_code)
            rc_raw = await valkey.zscore(rc_key, player_code)
            rt_sum = float(rt_sum_raw) if rt_sum_raw is not None else 0.0
            rc = int(float(rc_raw)) if rc_raw is not None else 0
            avg_response_time = round(rt_sum / rc, 3) if rc > 0 else 0.0

            standings.append(
                {
                    "user_code": player_code,
                    "user_name": user_name_map.get(player_code, ""),
                    "total_score": total_score,
                    "correct_score": correct_score,
                    "avg_response_time": avg_response_time,
                }
            )

        standings.sort(
            key=lambda x: (-x["total_score"], -x["correct_score"], x["avg_response_time"])
        )
        for rank, entry in enumerate(standings, start=1):
            entry["rank"] = rank

        return BaseResponse(
            status="success",
            message=log_message,
            data={"standings": standings},
        )

    except HTTPException:
        raise
    except Exception as e:
        log_message = f"Unexpected error fetching qualifier standings for match_code={match_code}: {e}"
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=log_message)


async def process_end_of_round(
    match_code: str,
    round_number: int,
    session: AsyncSession,
    valkey: Valkey,
    advance_count: int | None = None,
) -> BaseResponse:
    global_logger.info(f"Processing end of qualifier round {round_number} for match {match_code}")
    try:
        match_id = await session.scalar(
            select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False)
        )
        if match_id is None:
            raise HTTPException(status_code=404, detail=f"Match {match_code} not found")

        standings_resp = await get_qualifier_standings(match_code, round_number, session, valkey)
        if standings_resp.status != "success":
            raise HTTPException(status_code=500, detail="Failed to load qualifier standings")
        standings = standings_resp.data.get("standings", []) if standings_resp.data else []

        codes = [str(s.get("user_code")) for s in standings if s.get("user_code")]
        user_map: dict[str, "uuid.UUID"] = {}
        if codes:
            result = await session.execute(
                select(User.user_code, User.id).where(
                    User.user_code.in_(codes), User.is_deleted == False
                )
            )
            for row in result:
                user_map[row.user_code] = row.id

        existing = await session.execute(
            select(QualifierAdvancement.player_id, QualifierAdvancement.status).where(
                QualifierAdvancement.match_id == match_id,
                QualifierAdvancement.is_deleted == False,
            )
        )
        passed_ids: set = set()
        reserved_ids: set = set()
        for pid, status in existing:
            if pid is None:
                continue
            if status == "passed":
                passed_ids.add(pid)
            elif status == "reserve":
                reserved_ids.add(pid)

        already_passed_count = len(passed_ids)
        slots_remaining = max(0, 16 - already_passed_count)

        default_n = {1: 8, 2: 4, 3: 2, 4: 2}
        n = slots_remaining if round_number == 5 else default_n.get(round_number, 0)
        if isinstance(advance_count, int):
            n = advance_count

        to_pass: list[dict] = []
        to_reserve: list[dict] = []
        new_records: list[QualifierAdvancement] = []

        for entry in standings:
            user_code = entry.get("user_code")
            if user_code is None:
                continue
            if int(entry.get("total_score") or 0) < 0:
                uid = user_map.get(user_code)
                if uid and uid not in passed_ids and uid not in reserved_ids:
                    new_records.append(
                        QualifierAdvancement(
                            player_id=uid,
                            match_id=match_id,
                            round_number=round_number,
                            status="reserve",
                        )
                    )
                    reserved_ids.add(uid)
                    to_reserve.append({"user_code": user_code})

        candidates = [
            {"user_code": e.get("user_code"), "user_id": user_map.get(e.get("user_code"))}
            for e in standings
            if e.get("user_code")
            and user_map.get(e.get("user_code")) not in passed_ids
            and user_map.get(e.get("user_code")) not in reserved_ids
        ]

        select_count = min(n, slots_remaining)
        for sel in candidates[:select_count]:
            new_records.append(
                QualifierAdvancement(
                    player_id=sel["user_id"],
                    match_id=match_id,
                    round_number=round_number,
                    status="passed",
                )
            )
            passed_ids.add(sel["user_id"])
            to_pass.append({"user_code": sel["user_code"]})

        if new_records:
            session.add_all(new_records)
            await session.commit()

        slots_after = max(0, 16 - len(passed_ids))

        payload = {
            "type": "qualifier_round_result",
            "round_number": round_number,
            "passed": to_pass,
            "reserved": to_reserve,
            "slots_remaining": slots_after,
        }
        try:
            await valkey.publish(channel=match_code, message=json.dumps(payload))
        except Exception:
            global_logger.exception("Failed to publish qualifier round results via Valkey")

        log_message = (
            f"Round {round_number} finalized for match {match_code}: "
            f"passed={len(to_pass)}, reserved={len(to_reserve)}"
        )
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message, data=payload)

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        log_message = f"Unexpected error processing end of round {round_number} for match {match_code}: {e}"
        global_logger.error(log_message, exc_info=True)
        raise HTTPException(status_code=500, detail=log_message)


async def get_qualifier_advancements(match_code: str, session: AsyncSession) -> BaseResponse:
    try:
        match_id = await session.scalar(
            select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False)
        )
        if match_id is None:
            raise HTTPException(status_code=404, detail=f"Match {match_code} not found")

        result = await session.execute(
            select(
                QualifierAdvancement.round_number,
                QualifierAdvancement.status,
                User.user_code,
                User.user_name,
            )
            .join(User, QualifierAdvancement.player_id == User.id)
            .where(
                QualifierAdvancement.match_id == match_id,
                QualifierAdvancement.is_deleted == False,
            )
            .order_by(QualifierAdvancement.round_number.asc())
        )

        advancements = [
            {
                "round_number": int(rn),
                "status": status,
                "user_code": user_code,
                "user_name": user_name,
            }
            for rn, status, user_code, user_name in result.all()
        ]

        return BaseResponse(
            status="success",
            message=f"Fetched {len(advancements)} advancements",
            data={"advancements": advancements},
        )
    except HTTPException:
        raise
    except Exception as e:
        global_logger.error(
            f"Failed to fetch qualifier advancements for match {match_code}: {e}", exc_info=True
        )
        raise HTTPException(
            status_code=500, detail=f"Failed to fetch qualifier advancements: {e}"
        )
