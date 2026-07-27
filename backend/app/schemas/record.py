from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN  # e.g. "OC3_M"
_QUESTION_PATTERN = _settings.QUESTION_PATTERN  # e.g. "OC3_Q"


class RecordPostRequest(BaseRequest):
    match_code: str
    user_code: str
    question_code: str
    points: int
    is_deleted: bool = False

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
        return value

    @field_validator('question_code', mode='after')
    @classmethod
    def ensure_question_code_format(cls, value: str) -> str:
        if not value.startswith(_QUESTION_PATTERN):
            raise ValueError(f"question_code must start with '{_QUESTION_PATTERN}'")
        return value

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_user_code_format(cls, value: str) -> str:
        if not value.startswith("OC_U"):
            raise ValueError("user_code must start with 'OC_U'")
        return value

    @field_validator('points', mode='after')
    @classmethod
    def ensure_points_multiple_of_5(cls, value: int) -> int:
        if value % 5 != 0:
            raise ValueError("points must be a multiple of 5")
        return value