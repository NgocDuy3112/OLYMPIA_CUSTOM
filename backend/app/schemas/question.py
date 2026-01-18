from schemas.base import *


class QuestionPostRequest(BaseRequest):
    match_code: str
    question_code: str
    content: str
    answer: str
    explanation: str | None = None
    media_urls: list[str] | None = None

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

    @field_validator('media_urls', mode='after')
    @classmethod
    def ensure_media_urls_are_valid(cls, value: list[str] | None) -> list[str] | None:
        if value is not None:
            for url in value:
                if not (url.startswith("http://") or url.startswith("https://")):
                    raise ValueError(f"Invalid media URL: {url}")
        return value