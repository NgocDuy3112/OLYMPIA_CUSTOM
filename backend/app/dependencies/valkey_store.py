from valkey.asyncio import Valkey

from configs import ValkeySettings

settings = ValkeySettings()


async def get_valkey() -> Valkey:
    return Valkey.from_url(
        settings.VALKEY_URL, 
        decode_responses=True,
        socket_timeout=settings.VALKEY_TIMEOUT,
        socket_connect_timeout=settings.VALKEY_TIMEOUT,
        socket_keepalive=True,
        health_check_interval=settings.VALKEY_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True
    )