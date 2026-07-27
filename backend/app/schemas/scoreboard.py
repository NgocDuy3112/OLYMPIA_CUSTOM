from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN


class ScoreAdjustRequest(BaseRequest):
    match_code: str
    user_code: str
    new_score: int
    reason: str | None = None

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
        return value

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_user_code_format(cls, value: str) -> str:
        if not value.startswith("OC_U"):
            raise ValueError("user_code must start with 'OC_U'")
        return value

    @field_validator('new_score', mode='after')
    @classmethod
    def ensure_score_multiple_of_5(cls, value: int) -> int:
        if value % 5 != 0:
            raise ValueError("new_score must be a multiple of 5")
        return value