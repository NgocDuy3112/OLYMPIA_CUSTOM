from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from models.question import Question
from models.match import Match
from schemas.question import *



async def post_question_to_db(request: QuestionPostRequest, session: AsyncSession) -> BaseResponse:
    global_logger.info(f"POST request received to create question with code: {request.question_code}.")
    new_question = Question(
        question_code = request.question_code,
        content = request.content,
        answer = request.answer,
        explanation = request.explanation,
        media_urls = request.media_urls
    )
    session.add(new_question)
    global_logger.debug(f"Question object created and added to session. question_code={request.question_code}")

    try:
        await session.commit()
        await session.refresh(new_question)
        log_message = f"Question created successfully. question_code={request.question_code}, question_id={new_question.id}"
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"A question with question_code={request.question_code} already exists."
        global_logger.warning(log_message)
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=409)
        )
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while creating question with question_code={request.question_code}."
        global_logger.exception()
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=500)
        )



async def get_question_from_request_from_db(request: QuestionGetRequest, session: AsyncSession) -> BaseResponse:
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
    except Exception:
        log_message = f"An unexpected error occurred while fetching question with question_code={request.question_code}."
        global_logger.exception()
        return BaseResponse(
            status='error',
            message=log_message,
            exception=HTTPException(status_code=500)
        )