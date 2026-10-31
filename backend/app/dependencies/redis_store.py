from redis.asyncio import Redis

from configs import RedisSettings

settings = RedisSettings()

_redis_instance: Redis | None = None


async def get_redis() -> Redis:
    global _redis_instance
    if _redis_instance is not None:
        try:
            pong = await _redis_instance.ping()
            if pong:
                return _redis_instance
        except Exception:
            _redis_instance = None

    _redis_instance = Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_timeout=settings.REDIS_TIMEOUT,
        socket_connect_timeout=settings.REDIS_TIMEOUT,
        socket_keepalive=True,
        health_check_interval=settings.REDIS_HEALTH_CHECK_INTERVAL,
        retry_on_timeout=True,
    )
    return _redis_instance