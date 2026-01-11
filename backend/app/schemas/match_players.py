from app.schema.base import *


class PlayersMatchGetRequest(BaseRequest):
    match_id: UUID


class PlayersMatchGetResponse(BaseResponse):
    @model_validator(mode='after')
    def check_response_message(cls, values):
        response = values.get('response')
        if response is not None:
            if 'status' not in response:
                raise ValueError("Response must contain a 'status' key.")
            if 'players' not in response:
                raise ValueError("Response must contain a 'players' key.")
        return values