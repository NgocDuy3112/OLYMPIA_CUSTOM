from fastapi import APIRouter, Depends

from core.auth import *
from schemas.user import *
from models.user import *
from dependencies.postgresql_db import get_db


router = APIRouter(prefix="/auth", tags=["Uỷ Quyền"])



@router.post(
    "/signup", 
    response_model=TokenResponse,
    status_code=201
)
async def signup_api(user_data: UserCreate, session: AsyncSession = Depends(get_db)):
    try:
        return await signup(user_data, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")



@router.post(
    "/login", 
    response_model=TokenResponse,
    status_code=200
)
async def login_api(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_db)):
    try:
        return await login(form_data, session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")