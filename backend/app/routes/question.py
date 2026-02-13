from fastapi import APIRouter, Query, Depends

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from dependencies.gcp_services import get_google_drive_service, get_google_sheets_service
from schemas.question import *
from models.question import *
from core.question import *



router = APIRouter(prefix='/questions', tags=['Câu hỏi'])


@router.post(
    "/drive/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=201
)
async def post_questions_from_google_drive(
    match_code: str,
    session: AsyncSession = Depends(get_db),
    google_drive_service = Depends(get_google_drive_service),
    google_sheets_service = Depends(get_google_sheets_service)
) -> BaseResponse:
    """
    Endpoint to create a new question in the system.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await post_questions_from_google_drive_to_db(
            match_code, 
            session, 
            google_drive_service, 
            google_sheets_service
        )
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
    match_code: str = Query(..., description="The code of the match to which the question belongs."),
    question_code: str = Query(..., description="The code of the question to fetch."),
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to fetch questions based on the provided request parameters.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await get_question_from_request_from_db(match_code, question_code, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")