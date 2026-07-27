from valkey.asyncio import Valkey

from configs import ValkeySettings

settings = ValkeySettings()

_valkey_instance: Valkey | None = None


async def get_valkey() -> Valkey:
    global _valkey_instance
    if _valkey_instance is not None:
        try:
            pong = await _valkey_instance.ping()
            if pong:
                return _valkey_instance
        except Exception:
            _valkey_instance = None

    _valkey_instance = Valkey.from_url(
        settings.VALKEY_URL,
        decode_responses=True,
        socket_timeout=settings.VALKEY_TIMEOUT,
        socket_connect_timeout=settings.VALKEY_TIMEOUT,
        socket_keepalive=True,
        health_check_interval=settings.VALKEY_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
    )
    return _valkey_instance