from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN
_QUESTION_PATTERN = _settings.QUESTION_PATTERN


class ScoreAdjustRequest(BaseRequest):
    match_code: str
    user_code: str
    new_score: int | None = None
    question_code: str | None = None
    points: int | None = None
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

    @field_validator('question_code', mode='after')
    @classmethod
    def ensure_question_code_format(cls, value: str | None) -> str | None:
        if value is not None and not value.startswith(_QUESTION_PATTERN):
            raise ValueError(f"question_code must start with '{_QUESTION_PATTERN}'")
        return value

    @model_validator(mode='after')
    def ensure_score_input(self):
        if self.new_score is None and (self.question_code is None or self.points is None):
            raise ValueError("Provide new_score or question_code with points")
        if self.new_score is not None and self.new_score % 5 != 0:
            raise ValueError("new_score must be a multiple of 5")
        if self.points is not None and self.points % 5 != 0:
            raise ValueError("points must be a multiple of 5")
        return self
