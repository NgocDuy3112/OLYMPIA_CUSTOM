from schemas.base import *



class MatchPlayerAssignment(BaseModel):
    player_code: str
    position: int


class MatchInfoPostRequest(BaseRequest):
    match_code: str
    match_name: str
    players: list[MatchPlayerAssignment] | None = None

    @field_validator('match_code')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_M"):
            raise ValueError("match_code must start with 'OC3_M'")
        return value


class MatchPlayerInRoom(BaseModel):
    player_code: str
    user_name: str
    position: int


class MatchRoomResponse(BaseResponse):
    pass


class MatchUpdateRequest(BaseModel):
    match_name: str | None = None
    players: list[MatchPlayerAssignment] | None = None
