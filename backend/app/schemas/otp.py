from pydantic import BaseModel
from typing import Literal


class OTPRequest(BaseModel):
    user_code: str | None = None
    email: str | None = None
    purpose: Literal["login", "reset"] = "login"


class OTPVerifyRequest(BaseModel):
    user_code: str | None = None
    email: str | None = None
    purpose: Literal["login", "reset"] = "login"
    otp: str
