from fastapi import APIRouter, Query, Depends, HTTPException, UploadFile, File
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from dependencies.s3_services import get_s3_client, s3_settings
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
    try:

        filename = file.filename or ""
        derived = filename.rsplit('.', 1)[0] if filename else None
        final_match_code = match_code or derived
        if not final_match_code:
            raise HTTPException(status_code=400, detail="match_code not provided and could not be derived from file name")

        if match_code and derived and match_code != derived:
            raise HTTPException(status_code=400, detail="Provided match_code does not match uploaded file name")

        return await post_questions_from_excel_to_db(final_match_code, file, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


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
    try:
        return await post_qualifier_questions_from_excel_to_db(file, session)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


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
    try:
        return await post_questions_from_zip_to_db(
            file=file,
            s3_client=s3_client,
            bucket=s3_settings.S3_BUCKET_NAME,
            session=session,
            overwrite=True,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


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
    try:
        return await delete_question_from_db(match_code, question_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


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
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'mc']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_question_from_request(
    match_code: Annotated[str, Query(..., description="The code of the match to which the question belongs.")],
    question_code: Annotated[str | None, Query(description="The code of the question to fetch. If omitted, returns all questions in the match.")] = None,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    try:
        return await get_question_from_request_from_db(match_code, question_code, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


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
    try:
        return await patch_question_to_db(match_code, question_code, request, session)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")