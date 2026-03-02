from schemas.base import *


class RecordPostRequest(BaseRequest):
    match_code: str
    user_code: str
    question_code: str
    points: int
    is_deleted: bool = False

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_M"):
            raise ValueError("match_code must start with 'OC3_M'")
        return value

    @field_validator('question_code', mode='after')
    @classmethod
    def ensure_question_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_Q"):
            raise ValueError("question_code must start with 'OC3_Q'")
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