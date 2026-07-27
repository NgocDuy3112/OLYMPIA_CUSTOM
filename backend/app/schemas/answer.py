from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN
_QUESTION_PATTERN = _settings.QUESTION_PATTERN


class AnswerPostRequest(BaseRequest):
    match_code: str
    user_code: str
    question_code: str
    answer_text: str | None = None
    has_buzzed: bool = False
    timestamp: float | None = None

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
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
        if not value.startswith(_QUESTION_PATTERN):
            raise ValueError(f"question_code must start with '{_QUESTION_PATTERN}'")
        return value

    @model_validator(mode='after')
    def validate_answer_or_buzz(self) -> 'AnswerPostRequest':

        if not self.answer_text and not self.has_buzzed:
            raise ValueError("Must provide either answer_text or has_buzzed=True")
        return self