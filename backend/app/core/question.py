from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from utils.gcp_helpers import *
from models.question import Question
from models.match import Match
from schemas.question import *
from configs import *


QUESTION_SHEET_NAMES = ['KHOI_DONG', 'GIAI_MA', 'BUT_PHA', 'VE_DICH']



async def post_questions_from_google_drive_to_db(
    match_code: str, 
    session: AsyncSession,
    google_drive_service,
    google_sheets_service
) -> BaseResponse:
    global_logger.info(f"POST request received to inject questions from Google Drive with match code: {match_code}.")
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == match_code))
        if match_id is None:
            log_message = f"No match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        file_name = f"{match_code}/{match_code}"
        for sheet_name in QUESTION_SHEET_NAMES:
            questions = get_filtered_data_by_names(file_name, sheet_name, google_drive_service, google_sheets_service)
            question_objects = [Question(
                question_code=row[0],
                content=row[1],
                answer=row[2],
                explanation=row[3] if row[3] else None,
                media_urls=row[4].split(',') if row[4] else None,
                match_id=match_id
            ) for row in questions]
            session.add_all(question_objects)
            global_logger.debug(f"Added {len(question_objects)} questions from sheet '{sheet_name}' to session.")
        await session.commit()
        log_message = f"Questions injected successfully from Google Drive for match_code={match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"Question in match_code={match_code} already exists."
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
        log_message = f"An unexpected error occurred while injecting questions from Google Drive with match_code={match_code}."
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=500)
        )



async def post_question_to_db(
    request: QuestionPostRequest, 
    session: AsyncSession
) -> BaseResponse:
    global_logger.info(f"POST request received to add question with code: {request.question_code}.")
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == request.match_code))
        if match_id is None:
            log_message = f"No match found with match_code={request.match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404)
        question = Question(
            question_code=request.question_code,
            content=request.content,
            answer=request.answer,
            explanation=request.explanation,
            media_urls=request.media_urls,
            match_id=match_id
        )
        session.add(question)
        await session.commit()
        log_message = f"Question with question_code={request.question_code} added successfully to the database."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"Question with question_code={request.question_code} already exists."
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
        log_message = f"An unexpected error occurred while adding question with question_code={request.question_code}."
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=500)
        )



async def get_question_from_request_from_db(
    request: QuestionGetRequest, 
    session: AsyncSession
) -> BaseResponse:
    global_logger.info(f"GET request received to fetch question with code: {request.question_code}.")
    question_data = []
    try:
        if request.question_code is not None:
            query = select(Question).where(
                Question.question_code == request.question_code and 
                Question.match_id == select(Match.id).where(
                    Match.match_code == request.match_code)
                .scalar_subquery()
            )
            result = await session.scalar(query)
            question = result
            if question is None:
                log_message = f"No question found with question_code={request.question_code}."
                global_logger.warning(log_message)
                return BaseResponse(
                    status='error',
                    message=log_message,
                    exception=HTTPException(status_code=404)
                )
            question_data = [
                {
                    'question_code': question.question_code,
                    'content': question.content,
                    'answer': question.answer,
                    'explanation': question.explanation,
                    'media_urls': question.media_urls
                }
            ]
        else:
            query = select(Question).where(
                Question.match_id == select(Match.id).where(
                    Match.match_code == request.match_code)
                .scalar_subquery()
            )
            result = await session.scalars(query)
            questions = result.all()
            question_data = [
                {
                    'question_code': q.question_code,
                    'content': q.content,
                    'answer': q.answer,
                    'explanation': q.explanation,
                    'media_urls': q.media_urls
                }
                for q in questions
            ]
        log_message = f"Fetched {len(question_data)} questions from the database with question_code={request.question_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=question_data 
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"An unexpected error occurred while fetching question with question_code={request.question_code}: {str(e)}"
        global_logger.exception(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=500)
        )