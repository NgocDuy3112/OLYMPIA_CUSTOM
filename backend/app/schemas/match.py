from schemas.base import *



class MatchInfoPostRequest(BaseRequest):
    match_code: str
    match_name: str

    @field_validator('match_code', mode='after')
    @classmethod
    def ensure_match_code_format(cls, value: str) -> str:
        if not value.startswith("OC3_M"):
            raise ValueError("match_code must start with 'OC3_M'")
        return value