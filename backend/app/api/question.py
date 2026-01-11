from fastapi import APIRouter, Depends

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from schemas.question import *
from models.question import *
from core.question import *



router = APIRouter(prefix='/questions', tags=['Câu hỏi'])


@router.post(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse
)
async def post_question(
    request: QuestionPostRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to create a new question in the system.
    Accessible only by users with the 'admin' role.
    """
    return await post_question_to_db(request, session)



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse
)
async def get_question_from_request(
    request: QuestionGetRequest,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to fetch questions based on the provided request parameters.
    Accessible only by users with the 'admin' role.
    """
    return await get_question_from_request_from_db(request, session)