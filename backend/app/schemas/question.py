from schemas.base import *
from configs import AppSettings

_settings = AppSettings()
_MATCH_PATTERN = _settings.MATCH_PATTERN
_QUESTION_PATTERN = _settings.QUESTION_PATTERN


class QuestionPostRequest(BaseRequest):
    match_code: str
    question_code: str
    content: str
    answer: str
    explanation: str | None = None

    media_url: str | None = None

    options: list[str] | str | None = None

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

    @field_validator('media_url', mode='after')
    @classmethod
    def ensure_media_url_is_valid(cls, value: str | None) -> str | None:
        if value is not None and value != "":
            first = str(value).split(',')[0].strip()
            is_http = first.startswith("http://") or first.startswith("https://")
            is_s3_key = first.startswith(_MATCH_PATTERN) and "/" in first
            if not is_http and not is_s3_key:
                raise ValueError(
                    f"Invalid media_url: {first!r}. "
                    f"Must be an http(s):// URL or an S3 key in format '{_MATCH_PATTERN}xxx/filename'."
                )
        return value


class QuestionUpdateRequest(BaseModel):
    content: str | None = None
    answer: str | None = None
    explanation: str | None = None
    media_url: str | None = None

    options: list[str] | str | None = None


class QuestionCreateRequest(BaseModel):
    question_code: str
    content: str
    answer_a: str | None = None
    answer_b: str | None = None
    answer_c: str | None = None
    answer_d: str | None = None
    answer_e: str | None = None
    answer_f: str | None = None
    correct_answer: str | None = None
    explanation: str | None = None
    media_url: str | None = None
    match_code: str

    @property
    def answer(self) -> str | None:

        return self.correct_answer

    @property
    def options(self) -> list[str] | None:
        opts = []
        for f in (self.answer_a, self.answer_b, self.answer_c, self.answer_d, self.answer_e, self.answer_f):
            if f is not None:
                opts.append(f)
        return opts if opts else None
