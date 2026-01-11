from valkey.asyncio import Valkey

from configs import ValkeySettings

settings = ValkeySettings()


async def get_valkey_cache() -> Valkey:
    return Valkey.from_url(settings.VALKEY_CACHE_URL, decode_responses=True)


async def get_valkey_pubsub() -> Valkey:
    return Valkey.from_url(settings.VALKEY_PUBSUB_URL, decode_responses=True)