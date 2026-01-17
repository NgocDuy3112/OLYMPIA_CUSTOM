from pydantic import BaseModel, field_validator
from typing import Literal

from schemas.base import *


Role = Literal["guest", "player", "admin"]


class UserCreate(BaseModel):
    user_name: str
    user_code: str
    password: str
    role: Role = "player"

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_user_code_format(cls, value: str) -> str:
        if not value.startswith("OC_U"):
            raise ValueError("user_code must start with 'OC_U'")
        return value


class UserLogin(BaseModel):
    user_code: str
    password: str


class UserChangePassword(BaseModel):
    old_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    user_code: str | None = None
    user_name: str | None = None