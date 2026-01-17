from valkey.asyncio import Valkey

from configs import ValkeySettings

settings = ValkeySettings()


async def get_valkey() -> Valkey:
    return Valkey.from_url(settings.VALKEY_URL, decode_responses=True)