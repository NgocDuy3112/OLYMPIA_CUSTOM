from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from utils.gcp_helpers import *
from models.question import Question
from models.match import Match
from schemas.question import *
from configs import *
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook
from io import BytesIO


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
            raise HTTPException(status_code=404, detail=log_message)
        file_name = f"{match_code}/{match_code}"
        for sheet_name in QUESTION_SHEET_NAMES:
            questions = get_filtered_data_by_names(file_name, sheet_name, google_drive_service, google_sheets_service)
            question_objects = [Question(
                question_code=row[0],
                content=row[1],
                answer=row[2],
                explanation=row[3] if row[3] else None,
                media_url=str(row[4]).strip() if row[4] else None,
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
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while injecting questions from Google Drive with match_code={match_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def post_questions_from_excel_to_db(
    match_code: str,
    file: UploadFile,
    session: AsyncSession
) -> BaseResponse:
    """Load questions from an uploaded Excel file.

    The uploaded Excel file is expected to contain sheets named in QUESTION_SHEET_NAMES.
    Each sheet should have columns A-E corresponding to: question_code, content, answer, explanation, media_url.
    The first row is treated as header and skipped.
    """
    global_logger.info(f"POST request received to inject questions from Excel with match code: {match_code}.")
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == match_code))
        if match_id is None:
            log_message = f"No match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # read uploaded file bytes and load workbook
        content = await file.read()
        wb = load_workbook(BytesIO(content), data_only=True)

        for sheet_name in QUESTION_SHEET_NAMES:
            if sheet_name not in wb.sheetnames:
                global_logger.debug(f"Sheet '{sheet_name}' not found in uploaded workbook; skipping.")
                continue
            ws = wb[sheet_name]

            rows = []
            # iterate rows starting from second row (assume header in first row)
            for row in ws.iter_rows(min_row=2, max_col=5, values_only=True):
                if not row:
                    continue
                # require at least one non-empty cell after the first column to consider row valid
                if len(row) <= 1 or not any((cell is not None and str(cell).strip()) for cell in row[1:]):
                    continue
                qcode = row[0]
                content_cell = row[1]
                answer_cell = row[2] if len(row) > 2 else None
                explanation_cell = row[3] if len(row) > 3 else None
                media_cell = row[4] if len(row) > 4 else None

                # skip rows missing required fields
                if not qcode or not content_cell or not answer_cell:
                    global_logger.warning(f"Skipping invalid row in sheet '{sheet_name}': {row}")
                    continue

                rows.append((qcode, content_cell, answer_cell, explanation_cell, media_cell))

            question_objects = []
            for r in rows:
                try:
                    question_objects.append(Question(
                            question_code=str(r[0]).strip(),
                            content=str(r[1]),
                            answer=str(r[2]),
                            explanation=str(r[3]) if r[3] is not None else None,
                            media_url=str(r[4]).strip() if r[4] else None,
                            match_id=match_id
                        ))
                except Exception as e:
                    global_logger.error(f"Failed constructing Question object for row {r}: {e}")

            if question_objects:
                session.add_all(question_objects)
                global_logger.debug(f"Added {len(question_objects)} questions from sheet '{sheet_name}' to session.")

        await session.commit()
        log_message = f"Questions injected successfully from Excel for match_code={match_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except IntegrityError:
        await session.rollback()
        log_message = f"Question in match_code={match_code} already exists."
        global_logger.warning(log_message)
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        log_message = f"An unexpected error occurred while injecting questions from Excel with match_code={match_code}: {e}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)



async def post_question_to_db(
    request: QuestionPostRequest, 
    session: AsyncSession
) -> BaseResponse:
    global_logger.info(f"POST request received to add question with code: {request.question_code}.")
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == request.match_code, Match.is_deleted == False))
        if match_id is None:
            log_message = f"No match found with match_code={request.match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)
        question = Question(
            question_code=request.question_code,
            content=request.content,
            answer=request.answer,
            explanation=request.explanation,
            media_url=request.media_url,
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
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while adding question with question_code={request.question_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def get_question_from_request_from_db(
    match_code: str,
    question_code: str | None, 
    session: AsyncSession
) -> BaseResponse:
    global_logger.info(f"GET request received to fetch question with code: {question_code}.")
    question_data = []
    try:
        if question_code is not None:
            query = select(Question).where(
                Question.question_code == question_code,
                Question.is_deleted == False,
                Question.match_id == select(Match.id).where(
                    Match.match_code == match_code)
                .scalar_subquery()
            )
            result = await session.scalar(query)
            question = result
            if question is None:
                log_message = f"No question found with question_code={question_code}."
                global_logger.warning(log_message)
                raise HTTPException(status_code=400, detail=log_message)
            question_data = {
                'question_code': question.question_code,
                'content': question.content,
                'answer': question.answer,
                'explanation': question.explanation,
                'media_url': question.media_url
            }
        else:
            query = select(Question).where(
                Question.is_deleted == False,
                Question.match_id == select(Match.id).where(
                    Match.match_code == match_code)
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
                    'media_url': q.media_url
                }
                for q in questions
            ]
        log_message = f"Fetched {len(question_data)} questions from the database with question_code={question_code}."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message,
            data=question_data 
        )
    except HTTPException:
        raise
    except Exception as e:
        log_message = f"An unexpected error occurred while fetching question with question_code={question_code}: {str(e)}"
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def delete_question_from_db(match_code: str, question_code: str, session: AsyncSession) -> BaseResponse:
    """Soft delete a question from DB by setting is_deleted=True."""
    global_logger.info(f"Soft deleting question with question_code={question_code} in match_code={match_code} from database.")
    try:
        # Find match_id first to ensure question belongs to the correct match
        match_id = await session.scalar(select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False))
        if match_id is None:
            log_message = f"No active match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        query = select(Question).where(
            Question.question_code == question_code,
            Question.match_id == match_id,
            Question.is_deleted == False
        )
        result = await session.execute(query)
        question = result.scalars().one_or_none()

        if question is None:
            log_message = f"No active question found with question_code={question_code} in match_code={match_code} to delete."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        question.is_deleted = True
        await session.commit()

        log_message = f"Question with question_code={question_code} in match_code={match_code} has been soft deleted successfully."
        global_logger.info(log_message)
        return BaseResponse(
            status='success',
            message=log_message
        )
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while deleting question with question_code={question_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def patch_question_to_db(
    match_code: str,
    question_code: str,
    request: QuestionUpdateRequest,
    session: AsyncSession,
) -> BaseResponse:
    global_logger.info(f"PATCH request received to update question_code={question_code} in match_code={match_code}.")
    try:
        match_id = await session.scalar(
            select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False)
        )
        if match_id is None:
            log_message = f"No active match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        result = await session.execute(
            select(Question).where(
                Question.question_code == question_code,
                Question.match_id == match_id,
                Question.is_deleted == False,
            )
        )
        question = result.scalar_one_or_none()
        if question is None:
            log_message = f"No active question found with question_code={question_code} in match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        if request.content is not None:
            question.content = request.content
        if request.answer is not None:
            question.answer = request.answer
        if request.explanation is not None:
            question.explanation = request.explanation
        if request.media_url is not None:
            question.media_url = request.media_url

        await session.commit()
        log_message = f"Question updated successfully for question_code={question_code} in match_code={match_code}."
        global_logger.info(log_message)
        return BaseResponse(status='success', message=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while updating question with question_code={question_code}."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)
