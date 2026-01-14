from fastapi import APIRouter, Depends, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.valkey_store import get_valkey_cache
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
    cache: Annotated[ValkeyCache, Depends(get_valkey_cache)],
) -> BaseResponse:
    return await post_answer_to_db(request, session, cache)



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse
)
async def get_answers(
    request: AnswerGetRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    cache: Annotated[ValkeyCache, Depends(get_valkey_cache)]
) -> BaseResponse:
    return await get_answers_from_db(request, session, cache)