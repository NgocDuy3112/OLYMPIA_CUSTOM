from schemas.base import *


class QuestionPostRequest(BaseRequest):
    match_code: str
    question_code: str
    content: str
    answer: str
    explanation: str | None = None
    # store a single media URL (or comma-separated URLs) as a string
    media_url: str | None = None
    # Accept either a JSON string (stored legacy) or a list of option strings
    options: list[str] | str | None = None

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
            first = str(value).split(',')[0].strip()
            is_http = first.startswith("http://") or first.startswith("https://")
            is_s3_key = first.startswith("OC3_M") and "/" in first
            if not is_http and not is_s3_key:
                raise ValueError(
                    f"Invalid media_url: {first!r}. "
                    "Must be an http(s):// URL or an S3 key in format 'OC3_Mxxx/filename'."
                )
        return value


class QuestionUpdateRequest(BaseModel):
    content: str | None = None
    answer: str | None = None
    explanation: str | None = None
    media_url: str | None = None
    # Accept either a JSON string or a list of strings for convenience
    options: list[str] | str | None = None


# Backwards-compatible request shape expected by older tests
class QuestionCreateRequest(BaseModel):
    question_code: str
    content: str
    answer_a: str | None = None
    answer_b: str | None = None
    answer_c: str | None = None
    answer_d: str | None = None
    answer_e: str | None = None
    answer_f: str | None = None
    correct_answer: str | None = None  # e.g., 'A'
    explanation: str | None = None
    media_url: str | None = None
    match_code: str

    @property
    def answer(self) -> str | None:
        # Return the correct answer indicator (letter) expected by core functions
        return self.correct_answer

    @property
    def options(self) -> list[str] | None:
        opts = []
        for f in (self.answer_a, self.answer_b, self.answer_c, self.answer_d, self.answer_e, self.answer_f):
            if f is not None:
                opts.append(f)
        return opts if opts else None
