from schemas.base import *


class AnswerPostRequest(BaseRequest):
    match_code: str
    player_code: str
    question_code: str
    answer_text: str
    has_buzzed: bool
    timestamp: float

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_M"):
            raise ValueError("match_code must start with 'OC3_M'")
        return value

    @field_validator('player_code', mode='after')
    @classmethod
    def ensure_player_code_format(cls, value: str) -> str:
        if not value.startswith("OC_U"):
            raise ValueError("player_code must start with 'OC_U'")
        return value

    @field_validator('question_code', mode='after')
    @classmethod
    def ensure_question_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_Q"):
            raise ValueError("question_code must start with 'OC3_Q'")
        return value