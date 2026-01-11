from fastapi import APIRouter, Depends, status

from core.auth import *
from schemas.user import *
from models.user import *
from dependencies.postgresql_db import get_db


router = APIRouter(prefix="/auth", tags=["Uỷ Quyền"])



@router.post("/signup", response_model=TokenResponse)
async def signup_api(user_data: UserCreate, session: AsyncSession = Depends(get_db)):
    return await signup(user_data, session)



@router.post("/login", response_model=TokenResponse)
async def login_api(form_data: OAuth2PasswordRequestForm = Depends(), session: AsyncSession = Depends(get_db)):
    return await login(form_data, session)