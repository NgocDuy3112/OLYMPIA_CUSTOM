from pydantic import BaseModel, field_validator
from typing import Literal

from schemas.base import *
from configs import AppSettings

_USER_PATTERN = AppSettings().USER_PATTERN


Role = Literal["player", "mc", "admin"]


class UserCreate(BaseModel):
    user_name: str
    user_code: str | None = None

    password: str
    role: Role = "player"
    email: str | None = None

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_user_code_format(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(_USER_PATTERN):
            raise ValueError(f"user_code must start with '{_USER_PATTERN}'")
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