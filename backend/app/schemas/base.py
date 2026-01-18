from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from fastapi import HTTPException
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc)



class BaseRequest(BaseModel):
    pass



class BaseResponse(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    status: Literal["success", "error"]
    message: str
    data: dict[str, Any] | list[dict[str, Any]] | None = None