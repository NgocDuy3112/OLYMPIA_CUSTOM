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
    data: list[dict[str, Any]] | None = None
    exception: Any | None = None

    @model_validator(mode='after')
    def check_exception(self):
        if self.status == 'error' and self.exception is None:
            raise ValueError("An exception must be provided when status is 'error'.")
        return self