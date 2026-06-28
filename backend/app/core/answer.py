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
from utils.buzzer_lock import (
    try_acquire_buzzer_lock,
    release_buzzer_lock,
)
from utils.buzzer_winners import set_buzzer_winner


async def get_first_buzzer(
    match_id,
    question_id,
    session: AsyncSession,
) -> Answer | None:
    """Return the first buzz (has_buzzed=True) for a given match+question, ordered by created_at."""
    result = await session.execute(
        select(Answer)
        .where(
            Answer.match_id == match_id,
            Answer.question_id == question_id,
            Answer.has_buzzed == True,
            Answer.is_deleted == False,
        )
        .order_by(Answer.created_at.asc())
        .limit(1)
    )
    return result.scalars().first()


async def post_answer_to_db(
    request: AnswerPostRequest,
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    # Buzz attempts are loud (INFO) because they directly drive game flow —
    # every buzzer winner is an INFO line so ops can replay match timeline
    # from logs alone. Plain answer-text POSTs stay DEBUG.
    if request.has_buzzed:
        global_logger.info(
            f"[BUZZ] POST /answers/ from {request.user_code!r} for question={request.question_code!r} "
            f"match={request.match_code!r}"
        )
    else:
        global_logger.debug(f"POST request to add answer for question {request.question_code} in match {request.match_code} from player {request.user_code}")
    # Track the buzzer lock so we can release it on every exit path (success,
    # conflict, or exception). For non-buzz POSTs this stays None.
    buzzer_lock_token: str | None = None
    try:
        # Accept elapsed seconds from client (e.g., 13.456 seconds since timer start).
        # The client sends elapsed time, not Unix timestamp.
        # Clamp to reasonable range: 0 to 3600 seconds (1 hour max)
        client_ts = request.timestamp if request.timestamp is not None else None
        if client_ts is not None:
            try:
                client_ts = float(client_ts)
                # Clamp elapsed seconds to [0, 3600]
                effective_timestamp = max(0.0, min(3600.0, client_ts))
            except (ValueError, TypeError):
                effective_timestamp = 0.0
        else:
            effective_timestamp = 0.0

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

        # ── Server-side buzz winner logic ─────────────────────────────────────
        # Two layers of protection, applied in order:
        #  1. Valkey distributed lock (buzzer_lock:{match}:{question}) — atomic
        #     SET NX EX. The first POST that claims the lock is the authoritative
        #     buzzer; concurrent POSTs from other players get 409 immediately
        #     without touching the DB.
        #  2. Per-player ``existing_buzz`` check — if the SAME player double-taps
        #     the buzz button, the lock would already be theirs so the NX check
        #     would pass again. The existing-buzz check rejects the second POST
        #     with 200 + "already buzzed" message (frontend has already disabled
        #     the button after the first attempt, but this is defence-in-depth).
        is_buzz = request.has_buzzed is True
        if is_buzz:
            # Layer 1: Valkey lock
            buzzer_lock_token = await try_acquire_buzzer_lock(
                valkey, request.match_code, request.question_code,
            )
            if buzzer_lock_token is None:
                # Another player already holds the buzzer for this question.
                # Return 409 Conflict — the frontend should treat this as a
                # rejected buzz (no Zap icon, button stays disabled by the
                # ``blocked_buzz`` event the winner publishes).
                global_logger.info(
                    f"[BUZZ] Player {request.user_code!r} lost the race for "
                    f"question={request.question_code!r} match={request.match_code!r}"
                )
                raise HTTPException(
                    status_code=409,
                    detail=f"Buzzer already claimed for question {request.question_code}",
                )

            # Layer 2: per-player duplicate buzz check (defence-in-depth)
            existing_buzz = await session.scalar(
                select(Answer.id).where(
                    Answer.player_id == player_id,
                    Answer.match_id == match_id,
                    Answer.question_id == question_id,
                    Answer.has_buzzed == True,
                    Answer.is_deleted == False,
                )
            )
            if existing_buzz is not None:
                # This same player already buzzed (e.g. button double-tap
                # before the WS ``buzz`` echo flips ``hasPinged``). Return
                # 200 with a clear message instead of double-inserting.
                log_message = f"Player {request.user_code} already buzzed for question {request.question_code}."
                global_logger.info(log_message)
                return BaseResponse(status="success", message=log_message)

        # UPSERT: update existing answer if one exists, otherwise insert a new one.
        # Players can revise their answer multiple times; only the last submission is kept.
        # For buzz attempts the first POST wins — concurrent POSTs were already
        # rejected by the Valkey lock above, so this branch is uncontested.
        cache_key = f"answer:{request.match_code}:{request.user_code}:{request.question_code}"

        db_res = await session.execute(
            select(Answer).where(
                Answer.player_id == player_id,
                Answer.match_id == match_id,
                Answer.question_id == question_id,
                Answer.is_deleted == False,
            )
        )
        existing_answer = db_res.scalars().first()

        if existing_answer is not None:
            existing_answer.answer_text = request.answer_text
            existing_answer.timestamp = effective_timestamp
            existing_answer.has_buzzed = request.has_buzzed
            global_logger.debug(f"Updating existing answer for question_code={request.question_code} from user_code={request.user_code}.")
        else:
            new_answer = Answer(
                answer_text=request.answer_text,
                has_buzzed=request.has_buzzed,
                timestamp=effective_timestamp,
                player_id=player_id,
                match_id=match_id,
                question_id=question_id,
            )
            session.add(new_answer)
        await session.commit()

        # ── Publish buzzer winner (winner-only, lock-protected) ───────────────
        # Because the Valkey lock guarantees only the first buzzer reaches this
        # point, we no longer need ``get_first_buzzer`` + ``winner_user ==
        # request.user_code`` check — the player holding the lock IS the
        # winner. This eliminates the TOCTOU window that allowed two
        # concurrent POSTs to both believe they were first.
        if is_buzz:
            winner_payload = {
                "type": "buzzer_winner",
                "user_code": request.user_code,
                "match_code": request.match_code,
                "question_code": request.question_code,
            }
            block_payload = {
                "type": "blocked_buzz",
                "user_code": None,
                "match_code": request.match_code,
            }
            try:
                await valkey.publish(
                    channel=request.match_code,
                    message=json.dumps(winner_payload),
                )
                await valkey.publish(
                    channel=request.match_code,
                    message=json.dumps(block_payload),
                )
                global_logger.info(
                    f"[BUZZ WINNER] Player {request.user_code!r} won the buzzer "
                    f"for question {request.question_code!r} in match {request.match_code!r}"
                )
                # Persist the winner so a reconnecting player can re-render
                # the Zap icon (PPlayerRec.tsx) without waiting for admin to
                # re-send the event. Mirrors the ``vd_powers_used`` snapshot
                # pattern — see utils/ve_dich_powers.py and
                # handle_player_reconnect in utils/ws_message_processor.py.
                await set_buzzer_winner(
                    valkey,
                    request.match_code,
                    request.question_code,
                    request.user_code,
                )
            except Exception as e:
                global_logger.error(f"Failed to publish buzz winner: {e}", exc_info=True)

            # Release the buzzer lock IMMEDIATELY after publishing so the
            # answering window can be reopened by ``clear_buzz`` without
            # waiting for TTL. Without this, a second player attempting the
            # same question would block until the 10 s TTL expires.
            # (Reuse the finally block below for the release path.)
            await release_buzzer_lock(
                valkey, request.match_code, request.question_code, buzzer_lock_token,
            )
            buzzer_lock_token = None

        # Cache the answer for fast reads and publish to match channel.
        # Skipped for the buzzer flow because the winner already gets a
        # dedicated ``buzzer_winner`` event, and non-winners get blocked
        # by 409 before reaching here — so there's no downstream consumer
        # of a generic ``answer`` event with ``has_buzzed=True``.
        if not is_buzz:
            cache_payload = {
                "match_code": request.match_code,
                "user_code": request.user_code,
                "question_code": request.question_code,
                "answer_text": request.answer_text,
                "has_buzzed": request.has_buzzed,
                "timestamp": effective_timestamp,
                "type": "answer",
            }
            try:
                await valkey.set(cache_key, json.dumps(cache_payload))
                await valkey.publish(channel=request.match_code, message=json.dumps(cache_payload))
                global_logger.debug(f"[KDC ANSWER SYNC] Cached and published answer for match={request.match_code} user={request.user_code} question={request.question_code} answer={request.answer_text} ts={effective_timestamp}")
            except Exception as e:
                # Log but do not fail the request since DB commit succeeded
                global_logger.error(f"Failed to cache/publish answer for key={cache_key}: {e}", exc_info=True)

        # Demoted to DEBUG — the [BUZZ] line at the top already records buzz
        # attempts, and the per-answer "Successfully created" line was a 1-for-1
        # copy that doubled the log volume on every answer POST.
        global_logger.debug(
            f"Successfully created answer for question_code={request.question_code} in match_code={request.match_code} from user_code={request.user_code}."
        )
        return BaseResponse(status="success", message=f"Answer recorded for question_code={request.question_code}")
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
    finally:
        # Release the buzzer lock on EVERY exit path (success, conflict,
        # exception) so a crashed/mid-handler worker doesn't leave the lock
        # held. The release script is a no-op if the TTL already expired or
        # the lock was stolen — safe to call unconditionally.
        if buzzer_lock_token is not None and valkey:
            try:
                await release_buzzer_lock(
                    valkey,
                    request.match_code,
                    request.question_code,
                    buzzer_lock_token,
                )
            except Exception as exc:  # noqa: BLE001
                global_logger.warning(
                    f"[buzzer_lock] finally-release failed for "
                    f"match={request.match_code!r} question={request.question_code!r}: {exc}",
                    exc_info=True,
                )



async def get_answer_from_db(
    match_code: str, 
    user_code: str,
    question_code: str,
    session: AsyncSession,
    valkey: Valkey
) -> BaseResponse:
    global_logger.debug(f"[KDC ANSWER SYNC] GET request to fetch answer for question {question_code} in match {match_code} from player {user_code}")
    try:
        cache_key = f"answer:{match_code}:{user_code}:{question_code}"
        cached = await valkey.get(cache_key)
        if cached is not None:
            record_json = json.loads(cached)
            global_logger.debug(f"[KDC ANSWER SYNC] CACHE HIT for key={cache_key} answer={record_json.get('answer_text')} ts={record_json.get('timestamp')}")
            log_message = f"Fetched an answer from cache for key={cache_key}."
            global_logger.debug(log_message)
            return BaseResponse(
                status='success',
                message=log_message,
                data=record_json
            )
        global_logger.debug(f"[KDC ANSWER SYNC] CACHE MISS for key={cache_key}, fetching from DB")
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
        # Demoted to DEBUG — admin GET /answers/ polls every few seconds while
        # the question board is open. At INFO the log filled with one line per
        # poll, drowning out buzz / scoring events.
        global_logger.debug(
            f"Fetched answer for question_code={question_code} in match_code={match_code} from user_code={user_code}."
        )
        return BaseResponse(
            status='success',
            message=f"Answer for question_code={question_code}",
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
    global_logger.debug(f"Soft deleting answer for question {question_code} in match {match_code} from player {user_code}")
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
            global_logger.error(log_message, exc_info=True)
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
