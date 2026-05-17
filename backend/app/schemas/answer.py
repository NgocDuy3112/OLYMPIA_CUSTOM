from schemas.base import *


class AnswerPostRequest(BaseRequest):
    match_code: str
    user_code: str
    question_code: str
    answer_text: str | None = None  # Optional for buzz-only submissions
    has_buzzed: bool = False
    timestamp: float | None = None  # Optional, server will set if not provided

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_M"):
            raise ValueError("match_code must start with 'OC3_M'")
        return value

    @field_validator('user_code', mode='after')
    @classmethod
    def ensure_player_code_format(cls, value: str) -> str:
        if not value.startswith("OC_U"):
            raise ValueError("user_code must start with 'OC_U'")
        return value

    @field_validator('question_code', mode='after')
    @classmethod
    def ensure_question_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_Q"):
            raise ValueError("question_code must start with 'OC3_Q'")
        return value

    @model_validator(mode='after')
    def validate_answer_or_buzz(self) -> 'AnswerPostRequest':
        # Must provide either answer_text OR has_buzzed=True
        if not self.answer_text and not self.has_buzzed:
            raise ValueError("Must provide either answer_text or has_buzzed=True")
        return self