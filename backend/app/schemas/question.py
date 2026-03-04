from schemas.base import *


class QuestionPostRequest(BaseRequest):
    match_code: str
    question_code: str
    content: str
    answer: str
    explanation: str | None = None
    # store a single media URL (or comma-separated URLs) as a string
    media_url: str | None = None

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

    @field_validator('media_url', mode='after')
    @classmethod
    def ensure_media_url_is_valid(cls, value: str | None) -> str | None:
        if value is not None and value != "":
            # allow a single URL or comma-separated URLs; validate the first non-empty token
            first = str(value).split(',')[0].strip()
            if not (first.startswith("http://") or first.startswith("https://")):
                raise ValueError(f"Invalid media URL: {first}")
        return value


class QuestionUpdateRequest(BaseModel):
    content: str | None = None
    answer: str | None = None
    explanation: str | None = None
    media_url: str | None = None
