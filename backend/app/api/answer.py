from fastapi import APIRouter, Depends, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.valkey_store import get_valkey
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
    valkey: Annotated[Valkey, Depends(get_valkey)],
) -> BaseResponse:
    return await post_answer_to_db(request, session, valkey)



@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin', 'player']))],
    response_model=BaseResponse
)
async def get_answer(
    match_code: str, 
    player_code: str,
    question_code: str,
    session: Annotated[AsyncSession, Depends(get_db)],
    valkey: Annotated[Valkey, Depends(get_valkey)]
) -> BaseResponse:
    return await get_answer_from_db(match_code, player_code, question_code, session, valkey)