from fastapi import APIRouter, Query, Depends
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.user_auth import require_roles
from models.user import *
from schemas.user import *
from core.user import *



router = APIRouter(prefix='/users', tags=['Người dùng'])
@router.get(
    "/",
    dependencies=[Depends(require_roles(['admin']))],
    response_model=BaseResponse,
    status_code=200
)
async def get_user_from_request(
    user_code: Annotated[str | None, Query(..., description="The unique code of the user to fetch.")] = None,
    user_role: Annotated[Role | None, Query(..., description="Filter users by role: guest|player|admin")] = None,
    session: AsyncSession = Depends(get_db)
) -> BaseResponse:
    """
    Endpoint to fetch users based on the provided request parameters.
    Accessible only by users with the 'admin' role.
    """
    try:
        return await get_user_from_request_from_db(user_code, user_role, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")