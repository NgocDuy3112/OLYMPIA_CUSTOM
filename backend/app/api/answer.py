from fastapi import APIRouter, Depends, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from models.answer import *
from schemas.answer import *
from core.answer import *


router = APIRouter(prefix='/answers', tags=['Câu trả lời'])



@router.post(
    "/", 
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse)
async def post_answer(
    request: AnswerPostRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BaseResponse:
    return await post_answer_to_db(request, session)



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse
)
async def get_answers(
    request: AnswerGetRequest,
    match_code: Annotated[str, Query(pattern="OC3_M[0-9]{2}")],
    session: Annotated[AsyncSession, Depends(get_db)],
) -> BaseResponse:
    return await get_answers_from_db(match_code, request, session)