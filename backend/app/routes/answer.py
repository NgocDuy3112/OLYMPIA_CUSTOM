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
    response_model=BaseResponse,
    status_code=201
)
async def post_answer(
    request: AnswerPostRequest,
    session: Annotated[AsyncSession, Depends(get_db)],
    valkey: Annotated[Valkey, Depends(get_valkey)],
) -> BaseResponse:
    try:
        return await post_answer_to_db(request, session, valkey)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete(
    "/{match_code}/{user_code}/{question_code}",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def delete_answer(
    match_code: str,
    user_code: str,
    question_code: str,
    session: Annotated[AsyncSession, Depends(get_db)]
) -> BaseResponse:
    try:
        return await delete_answer_from_db(match_code, user_code, question_code, session)
    except HTTPException:
        raise
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
async def get_answer(
    match_code: Annotated[str, Query(..., description="Mã trận đấu, phải bắt đầu với 'OC3_M'")],
    user_code: Annotated[str | None, Query(description="Mã người chơi. Nếu bỏ qua, trả về tất cả answer trong match (hoặc theo question_code).")] = None,
    question_code: Annotated[str | None, Query(description="Mã câu hỏi. Nếu bỏ qua, trả về tất cả answer của player trong match.")] = None,
    session: Annotated[AsyncSession, Depends(get_db)] = None,
    valkey: Annotated[Valkey, Depends(get_valkey)] = None,
) -> BaseResponse:
    try:
        return await get_answer_from_db(match_code, user_code, question_code, session, valkey)
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")