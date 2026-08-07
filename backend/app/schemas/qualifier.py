from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN
_QUESTION_PATTERN = _settings.QUESTION_PATTERN


class QualifierScoreRequest(BaseRequest):

    match_code: str
    question_code: str
    correct_answer: str
    round_number: int = 1

    @field_validator("match_code", mode="after")
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
        return value

    @field_validator("question_code", mode="after")
    @classmethod
    def ensure_question_code_format(cls, value: str) -> str:
        if not value.startswith(_QUESTION_PATTERN):
            raise ValueError(f"question_code must start with '{_QUESTION_PATTERN}'")
        return value

    @field_validator("correct_answer", mode="after")
    @classmethod
    def ensure_valid_option(cls, value: str) -> str:
        if value.upper() not in {"A", "B", "C", "D", "E", "F"}:
            raise ValueError("correct_answer must be one of A, B, C, D, E, F")
        return value.upper()

    @field_validator("round_number", mode="after")
    @classmethod
    def ensure_valid_round(cls, value: int) -> int:
        if value < 1 or value > 5:
            raise ValueError("round_number must be between 1 and 5")
        return value


class EndRoundRequest(BaseRequest):
    match_code: str
    round_number: int

    advance_count: int | None = None

    @field_validator("match_code", mode="after")
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith(_MATCH_PATTERN):
            raise ValueError(f"match_code must start with '{_MATCH_PATTERN}'")
        return value

    @field_validator("round_number", mode="after")
    @classmethod
    def ensure_valid_round(cls, value: int) -> int:
        if value < 1 or value > 5:
            raise ValueError("round_number must be between 1 and 5")
        return value

    @field_validator("advance_count", mode="after")
    @classmethod
    def ensure_advance_count(cls, value: int | None) -> int | None:
        if value is None:
            return value
        if value < 0:
            raise ValueError("advance_count must be non-negative")
        return value
