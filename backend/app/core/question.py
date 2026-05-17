import json
import zipfile
import mimetypes
from sqlalchemy import select, text

# Alpine Linux lacks /etc/mime.types — register common media types explicitly.
for _ext, _mime in [
    (".jpg", "image/jpeg"), (".jpeg", "image/jpeg"), (".png", "image/png"),
    (".gif", "image/gif"), (".webp", "image/webp"), (".svg", "image/svg+xml"),
    (".mp3", "audio/mpeg"), (".ogg", "audio/ogg"), (".wav", "audio/wav"),
    (".aac", "audio/aac"), (".m4a", "audio/mp4"),
    (".mp4", "video/mp4"), (".webm", "video/webm"), (".mov", "video/quicktime"),
]:
    mimetypes.add_type(_mime, _ext)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from logger import global_logger
from models.question import Question
from models.match import Match
from schemas.question import *
from configs import *
from fastapi import HTTPException, UploadFile
from openpyxl import load_workbook
from io import BytesIO

QUESTION_SHEET_NAMES = ['KHOI_DONG', 'GIAI_MA', 'BUT_PHA', 'VE_DICH']


def _normalize_media_url(raw, match_code: str) -> str | None:
    """Normalize media_url from Excel:
    - Empty/None → None
    - Just a filename (e.g. OC3_Q_KD_1_1.png) → prepend match_code
    - Already a full S3 key or http URL → keep as-is
    """
    if raw is None:
        return None
    v = str(raw).strip()
    if not v or v == "None":
        return None
    if v.startswith("http://") or v.startswith("https://") or v.startswith("OC3_M"):
        return v
    return f"{match_code}/{v}"


async def post_questions_from_excel_to_db(
    match_code: str,
    file: UploadFile,
    session: AsyncSession,
    overwrite: bool = False
) -> BaseResponse:
    """Load questions from an uploaded Excel file.

    The uploaded Excel file is expected to contain sheets named in QUESTION_SHEET_NAMES.
    Each sheet should have columns A-E corresponding to: question_code, content, answer, explanation, media_url.
    The first row is treated as header and skipped.

    If overwrite=True, deletes existing questions for this match before importing.
    """
    global_logger.info(f"POST request received to inject questions from Excel with match code: {match_code}, overwrite={overwrite}.")
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == match_code))
        if match_id is None:
            log_message = f"No match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        # If overwrite mode, remove all dependents then questions for this match.
        # Done explicitly in order because the FK constraints may not have CASCADE.
        if overwrite:
            for dep in ("answers", "records", "qualifier_records"):
                await session.execute(
                    text(f"DELETE FROM {dep} WHERE match_id = :match_id"),  # noqa: S608
                    {"match_id": match_id},
                )
            await session.execute(
                text("DELETE FROM questions WHERE match_id = :match_id"),
                {"match_id": match_id},
            )
            await session.commit()
            global_logger.info(f"Deleted existing questions for match_code={match_code} in overwrite mode.")

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
                            media_url=_normalize_media_url(r[4], match_code),
                            match_id=match_id
                        ))
                except Exception as e:
                    global_logger.error(f"Failed constructing Question object for row {r}: {e}", exc_info=True)

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
        # Normalize options: store as JSON-encoded string in DB for consistency
        opts_value = None
        if request.options is not None:
            if isinstance(request.options, list):
                try:
                    opts_value = json.dumps(request.options, ensure_ascii=False)
                except Exception:
                    opts_value = None
            elif isinstance(request.options, str):
                opts_value = request.options

        question = Question(
            question_code=request.question_code,
            content=request.content,
            answer=request.answer,
            explanation=request.explanation,
            media_url=request.media_url,
            options=opts_value,
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


async def post_qualifier_questions_from_excel_to_db(
    file: UploadFile,
    session: AsyncSession,
) -> BaseResponse:
    """Load Vòng Loại questions from an uploaded Excel file.

    Constraints:
    - File name must start with 'OC3_VL' (the match_code is derived from the file name).
    - File must contain exactly one sheet; the first sheet is used.
    - Columns (A-K, header row skipped):
        A: question_code (must start with 'OC3_Q_VL')
        B: content
        C: answer (must be A-F)
        D: explanation (optional)
        E: media_url (optional)
        F-K: option texts for choices A-F (all 6 required)
    """
    filename = (file.filename or "").strip()
    stem = filename.rsplit(".", 1)[0] if filename else ""
    global_logger.info(f"POST qualifier questions from Excel: file='{filename}'")

    if not stem.startswith("OC3_VL"):
        log_message = f"Qualifier Excel file name must start with 'OC3_VL', got '{filename}'."
        global_logger.warning(log_message)
        raise HTTPException(status_code=400, detail=log_message)

    match_code = stem
    try:
        match_id = await session.scalar(select(Match.id).where(Match.match_code == match_code, Match.is_deleted == False))
        if match_id is None:
            log_message = f"No match found with match_code={match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        content = await file.read()
        wb = load_workbook(BytesIO(content), data_only=True)
        ws = wb.worksheets[0]  # single sheet only

        skipped = 0
        question_objects: list[Question] = []

        for row in ws.iter_rows(min_row=2, max_col=11, values_only=True):
            if not row or not any(cell is not None for cell in row):
                continue

            qcode = str(row[0]).strip() if row[0] is not None else ""
            content_cell = str(row[1]).strip() if row[1] is not None else ""
            answer_cell = str(row[2]).strip().upper() if row[2] is not None else ""
            explanation_cell = str(row[3]).strip() if row[3] is not None else None
            media_cell = _normalize_media_url(row[4], match_code)
            opts = [str(row[i]).strip() if row[i] is not None else "" for i in range(5, 11)]

            # strict validation
            if not qcode.startswith("OC3_Q_VL"):
                global_logger.warning(f"Skipping row: question_code '{qcode}' must start with 'OC3_Q_VL'.")
                skipped += 1
                continue
            if not content_cell:
                global_logger.warning(f"Skipping row '{qcode}': missing content.")
                skipped += 1
                continue
            if answer_cell not in ("A", "B", "C", "D", "E", "F"):
                global_logger.warning(f"Skipping row '{qcode}': invalid answer '{answer_cell}', must be A-F.")
                skipped += 1
                continue
            if any(opt == "" for opt in opts):
                global_logger.warning(f"Skipping row '{qcode}': all 6 option columns (F-K) are required.")
                skipped += 1
                continue

            opts_json = json.dumps(opts, ensure_ascii=False)
            question_objects.append(Question(
                question_code=qcode,
                content=content_cell,
                answer=answer_cell,
                explanation=explanation_cell if explanation_cell else None,
                media_url=media_cell,
                options=opts_json,
                match_id=match_id,
            ))

        if not question_objects:
            log_message = f"No valid qualifier questions found in '{filename}' (skipped {skipped} rows)."
            global_logger.warning(log_message)
            raise HTTPException(status_code=400, detail=log_message)

        session.add_all(question_objects)
        await session.commit()
        log_message = (
            f"Qualifier questions imported successfully from '{filename}' "
            f"for match_code={match_code}: {len(question_objects)} added, {skipped} skipped."
        )
        global_logger.info(log_message)
        return BaseResponse(status="success", message=log_message)

    except IntegrityError:
        await session.rollback()
        log_message = f"One or more qualifier questions in '{filename}' already exist."
        global_logger.warning(log_message)
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"Unexpected error importing qualifier questions from '{filename}'."
        global_logger.exception(log_message)
        raise HTTPException(status_code=500, detail=log_message)


async def post_qualifier_question_to_db(
    request: QuestionPostRequest,
    session: AsyncSession,
) -> BaseResponse:
    """Create a qualifier (Vòng Loại) question with stricter validation.

    Requirements:
    - question_code must start with 'OC3_Q_VL'
    - answer must be one of 'A'..'F'
    - options must be provided as a list of at least 6 strings, or as a JSON-encoded string representing such a list
    """
    global_logger.info(f"POST qualifier question received: {request.question_code}")
    try:
        # validate match exists
        match_id = await session.scalar(select(Match.id).where(Match.match_code == request.match_code, Match.is_deleted == False))
        if match_id is None:
            log_message = f"No match found with match_code={request.match_code}."
            global_logger.warning(log_message)
            raise HTTPException(status_code=404, detail=log_message)

        qc = (request.question_code or "").upper()
        if not qc.startswith("OC3_Q_VL"):
            raise HTTPException(status_code=400, detail="Qualifier question_code must start with 'OC3_Q_VL'")

        ans = (request.answer or "").upper()
        if ans not in ("A", "B", "C", "D", "E", "F"):  # strict answer validation
            raise HTTPException(status_code=400, detail="Qualifier answer must be one of 'A','B','C','D','E','F'")

        # Normalize and validate options
        opts_value = None
        opts_list: list[str] | None = None
        if request.options is None:
            raise HTTPException(status_code=400, detail="Qualifier questions require 'options' (array of 6 strings)")

        if isinstance(request.options, list):
            opts_list = request.options
        elif isinstance(request.options, str):
            try:
                parsed = json.loads(request.options)
                if isinstance(parsed, list):
                    opts_list = parsed
                else:
                    raise HTTPException(status_code=400, detail="Qualifier 'options' JSON must be an array of strings")
            except ValueError:
                raise HTTPException(status_code=400, detail="Failed to parse 'options' JSON for qualifier question")

        if not opts_list or len(opts_list) < 6:
            raise HTTPException(status_code=400, detail="Qualifier questions require exactly 6 options")

        # take first six
        opts_list = [str(x) for x in opts_list[:6]]
        try:
            opts_value = json.dumps(opts_list, ensure_ascii=False)
        except Exception:
            opts_value = None

        question = Question(
            question_code=request.question_code,
            content=request.content,
            answer=ans,
            explanation=request.explanation,
            media_url=request.media_url,
            options=opts_value,
            match_id=match_id,
        )
        session.add(question)
        await session.commit()
        log_message = f"Qualifier question with question_code={request.question_code} added successfully to the database."
        global_logger.info(log_message)
        return BaseResponse(status='success', message=log_message)
    except IntegrityError:
        await session.rollback()
        log_message = f"Question with question_code={request.question_code} already exists."
        global_logger.warning(log_message)
        raise HTTPException(status_code=400, detail=log_message)
    except HTTPException:
        raise
    except Exception:
        await session.rollback()
        log_message = f"An unexpected error occurred while adding qualifier question with question_code={request.question_code}."
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
            # Try to return options as parsed list when possible for convenience
            parsed_options = None
            if question.options is not None:
                try:
                    parsed = json.loads(question.options)
                    if isinstance(parsed, list):
                        parsed_options = parsed
                    else:
                        parsed_options = question.options
                except Exception:
                    parsed_options = question.options

            question_data = {
                'question_code': question.question_code,
                'content': question.content,
                'answer': question.answer,
                'explanation': question.explanation,
                'media_url': question.media_url,
                'options': parsed_options,
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
            question_data = []
            for q in questions:
                parsed_options = None
                if q.options is not None:
                    try:
                        parsed = json.loads(q.options)
                        parsed_options = parsed if isinstance(parsed, list) else q.options
                    except Exception:
                        parsed_options = q.options
                question_data.append({
                    'question_code': q.question_code,
                    'content': q.content,
                    'answer': q.answer,
                    'explanation': q.explanation,
                    'media_url': q.media_url,
                    'options': parsed_options,
                })
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
        if request.options is not None:
            if isinstance(request.options, list):
                try:
                    question.options = json.dumps(request.options, ensure_ascii=False)
                except Exception:
                    question.options = None
            else:
                question.options = request.options

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


_MEDIA_MIME_TYPES: frozenset[str] = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/aac",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
})


async def post_questions_from_zip_to_db(
    file: UploadFile,
    s3_client,
    bucket: str,
    session: AsyncSession,
    overwrite: bool = False,
) -> BaseResponse:
    """Import questions + media từ một file ZIP.

    Cấu trúc ZIP:
      {match_code}.zip
        {match_code}.xlsx          ← bắt buộc
        OC3_Q_KD_1_1.jpg           ← tuỳ chọn, nhiều file media
        OC3_Q_GM_2_1.mp3
        ...

    Thứ tự xử lý: upload S3 trước → import DB sau.
    Nếu một file media upload lỗi, log warning và bỏ qua (không dừng toàn bộ).

    If overwrite=True, deletes existing questions before importing.
    """
    filename = (file.filename or "").strip()
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    match_code = stem

    global_logger.info(f"ZIP import started: file='{filename}', match_code='{match_code}'")

    if not match_code.startswith("OC3_M"):
        raise HTTPException(
            status_code=400,
            detail=f"Tên file ZIP phải bắt đầu bằng 'OC3_M', nhận được: '{filename}'.",
        )

    raw = await file.read()
    try:
        zf = zipfile.ZipFile(BytesIO(raw))
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="File không phải định dạng ZIP hợp lệ.")

    names = zf.namelist()

    # Tìm file Excel (bỏ qua path prefix nếu có, vd: __MACOSX/...)
    excel_name = f"{match_code}.xlsx"
    excel_entry = next(
        (n for n in names if n.split("/")[-1] == excel_name and not n.startswith("__")),
        None,
    )
    if excel_entry is None:
        raise HTTPException(
            status_code=400,
            detail=f"Không tìm thấy '{excel_name}' trong ZIP.",
        )

    # Upload tất cả file media lên S3 (bỏ qua lỗi đơn lẻ)
    media_ok: list[str] = []
    media_fail: list[str] = []

    for entry in names:
        basename = entry.split("/")[-1]
        if not basename or basename == excel_name or entry.startswith("__"):
            continue

        mime, _ = mimetypes.guess_type(basename)
        if not mime or mime not in _MEDIA_MIME_TYPES:
            
            global_logger.warning(f"ZIP: bỏ qua '{entry}' (MIME không hợp lệ: {mime!r})")
            continue

        key = f"{match_code}/{basename}"
        try:
            data = zf.read(entry)
            await s3_client.put_object(
                Bucket=bucket, Key=key, Body=data,
                ContentType=mime, ContentLength=len(data),
            )
            media_ok.append(basename)
            global_logger.info(f"ZIP: S3 upload ok key='{key}' ({len(data)} bytes)")
        except Exception as exc:
            media_fail.append(basename)
            global_logger.warning(
                f"ZIP: S3 upload failed for key='{key}' ({len(data)} bytes): {exc}",
                exc_info=True,
            )

    # Import câu hỏi từ Excel (dùng lại hàm hiện có)
    excel_bytes = zf.read(excel_entry)
    excel_file = UploadFile(filename=excel_name, file=BytesIO(excel_bytes))

    result = await post_questions_from_excel_to_db(match_code, excel_file, session, overwrite=overwrite)

    summary_parts = [result.message]
    if media_ok:
        summary_parts.append(f"Media uploaded: {len(media_ok)} file(s).")
    if media_fail:
        summary_parts.append(f"Media skipped (lỗi): {', '.join(media_fail)}.")

    return BaseResponse(
        status="error" if media_fail else "success",
        message=" | ".join(summary_parts),
    )
