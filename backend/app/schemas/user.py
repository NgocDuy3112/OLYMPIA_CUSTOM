from pydantic import BaseModel, field_validator
from typing import Literal

from schemas.base import *


Role = Literal["guest", "player", "mc", "admin"]


class UserCreate(BaseModel):
    user_name: str
    user_code: str | None = None
    # Password optional: backend will generate and email credentials when omitted
    password: str | None = None
    role: Role = "player"
    email: str | None = None

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_user_code_format(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith("OC_U"):
            raise ValueError("user_code must start with 'OC_U'")
        return value


class UserLogin(BaseModel):
    user_code: str
    password: str


class UserChangePassword(BaseModel):
    old_password: str
    new_password: str


class UserUpdateRequest(BaseModel):
    user_name: str | None = None
    role: Role | None = None
    new_password: str | None = None
    email: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    user_code: str | None = None
    user_name: str | None = None


class PasswordResetRequest(BaseModel):
    token: str
    new_password: str


class MagicLoginRequest(BaseModel):
    token: str