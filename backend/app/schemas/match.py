from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN


class MatchPlayerAssignment(BaseModel):
    user_code: str
    position: int


class MatchInfoPostRequest(BaseRequest):
    match_code: str
    match_name: str
    match_status: str | None = None
    players: list[MatchPlayerAssignment] | None = None

    @field_validator('match_code')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
        return value


class MatchPlayerInRoom(BaseModel):
    user_code: str
    user_name: str
    position: int


class MatchRoomResponse(BaseResponse):
    pass


class MatchUpdateRequest(BaseModel):
    match_name: str | None = None
    match_status: str | None = None
    players: list[MatchPlayerAssignment] | None = None


class MatchCreateRequest(MatchInfoPostRequest):
    pass
