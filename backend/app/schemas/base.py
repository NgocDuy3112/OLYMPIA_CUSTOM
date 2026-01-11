from uuid import UUID, uuid6
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
from fastapi import HTTPException
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc)



class BaseRequest(BaseModel):
    pass



class BaseResponse(BaseModel):
    status: Literal["success", "error"]
    message: str
    data: list[dict[str, Any]] | None = None
    exception: HTTPException | None = None

    @model_validator(mode='after')
    def check_exception(cls, values):
        status = values.get('status')
        exception = values.get('exception')
        if status == 'error' and exception is None:
            raise ValueError("An HTTPException must be provided when status is 'error'.")
        return values