from fastapi import APIRouter, Query, Depends, HTTPException, UploadFile, File
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from dependencies.s3_services import get_s3_client, _s3_settings
from schemas.question import *
from models.question import *
from core.question import *



router = APIRouter(prefix='/questions', tags=['Câu hỏi'])


@router.post(
    "/excel/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_questions_from_excel(
    file: UploadFile = File(...),
    match_code: str | None = None,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    """Upload an Excel file containing questions. If `match_code` is provided it must match the uploaded
    file name (without extension). If omitted, the match_code is derived from the uploaded file name.
    """
    try:
        # derive match_code from filename if not provided
        filename = file.filename or ""
        derived = filename.rsplit('.', 1)[0] if filename else None
        final_match_code = match_code or derived
        if not final_match_code:
            raise HTTPException(status_code=400, detail="match_code not provided and could not be derived from file name")
        # if both provided, ensure they match
        if match_code and derived and match_code != derived:
            raise HTTPException(status_code=400, detail="Provided match_code does not match uploaded file name")

        return await post_questions_from_excel_to_db(final_match_code, file, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.post(
    "/excel/qualifier/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_qualifier_questions_from_excel(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    """Upload a single-sheet Excel file for Vòng Loại questions.

    The file name (without extension) must start with 'OC3_VL' and will be used
    as the match_code. Columns A-K: question_code, content, answer (A-F),
    explanation, media_url, option_A, option_B, option_C, option_D, option_E, option_F.
    """
    try:
        return await post_qualifier_questions_from_excel_to_db(file, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.post(
    "/zip/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201,
)
async def post_questions_from_zip(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_db),
    s3_client=Depends(get_s3_client),
) -> BaseResponse:
    """Upload một file ZIP chứa Excel câu hỏi + file media.

    Cấu trúc ZIP:
      {match_code}.zip
        {match_code}.xlsx
        OC3_Q_KD_1_1.jpg
        OC3_Q_GM_2_1.mp3
        ...

    Media lỗi upload sẽ bị bỏ qua (log warning), câu hỏi vẫn được import.
    """
    try:
        return await post_questions_from_zip_to_db(
            file=file,
            s3_client=s3_client,
            bucket=_s3_settings.S3_BUCKET_NAME,
            session=session,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")



@router.delete(
    "/{match_code}/{question_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def delete_question(
    match_code: str,
    question_code: str,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to delete a question based on the provided match and question codes.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await delete_question_from_db(match_code, question_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.post(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_question(
    request: QuestionPostRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    try:
        return await post_question_to_db(request, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_question_from_request(
    match_code: Annotated[str, Query(..., description="The code of the match to which the question belongs.")],
    question_code: Annotated[str | None, Query(description="The code of the question to fetch. If omitted, returns all questions in the match.")] = None,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to fetch questions based on the provided request parameters.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await get_question_from_request_from_db(match_code, question_code, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")


@router.patch(
    "/{match_code}/{question_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def patch_question(
    match_code: str,
    question_code: str,
    request: QuestionUpdateRequest,
    session: AsyncSession = Depends(get_db),
) -> BaseResponse:
    """Endpoint to update an existing question by match and question code."""
    try:
        return await patch_question_to_db(match_code, question_code, request, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")