import aioboto3
from botocore.config import Config
from configs import S3Settings
from logger import global_logger

s3_settings = S3Settings()

# Force path-style addressing for S3-compatible providers (Vietnix, MinIO, etc.)
# Virtual-hosted-style (default) fails when the endpoint is not AWS S3.
#
# retry config:
#   - max_attempts=1: presign + head_object are cheap idempotent calls; we'd
#     rather fail fast and let the cache miss recover on the next request than
#     spend seconds waiting for 3 internal retries on a flaky network.
#   - connect_timeout / read_timeout: bound the TCP handshake so the request
#     doesn't queue behind a flaky S3 endpoint.
#
# max_pool_connections=50: 1 match has ~30 players + admin + MC, all of whom
# can request presigned URLs simultaneously. Default 10 is too tight.
S3_CONFIG = Config(
    s3={"addressing_style": "path"},
    signature_version='s3',
    retries={'max_attempts': 1},
    connect_timeout=3,
    read_timeout=5,
    max_pool_connections=50,
)


def get_s3_settings() -> S3Settings:
    return s3_settings


# ── Module-level singleton ────────────────────────────────────────────────
# aioboto3's `Session` and `client` are cheap to create but the underlying
# botocore HTTPConnectionPool takes 100-300 ms of TCP+TLS handshake to talk
# to S3 VN-HCM-1. Spinning up a new client per request throws that work
# away on every presign call. We keep a single client alive for the entire
# FastAPI worker process so HTTP keep-alive, DNS caching, and connection
# pooling are all reused.

s3_session: aioboto3.Session | None = None
s3_client = None  # the live `async with` context — not just a config object


def _build_session() -> aioboto3.Session:
    return aioboto3.Session(
        aws_access_key_id=s3_settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=s3_settings.S3_SECRET_ACCESS_KEY,
        region_name=s3_settings.S3_REGION,
    )


async def init_s3_client() -> None:
    """Create the singleton S3 client. Called once during FastAPI lifespan startup.

    Best-effort: any failure is logged and the singleton stays None. Calls
    to get_s3_client() will then raise a clear 503-shaped HTTPException so
    callers (routes/media.py, routes/question.py) can fail gracefully.
    """
    global s3_session, s3_client
    if s3_client is not None:
        return

    try:
        s3_session = _build_session()
        # aioboto3's `client()` returns an AioBaseClient that only opens its
        # connection pool once entered. Holding it in the open state for the
        # whole worker is the whole point of this refactor.
        s3_client = await s3_session.client(
            "s3",
            endpoint_url=s3_settings.S3_ENDPOINT_URL,
            config=S3_CONFIG,
        ).__aenter__()
    except Exception as exc:
        global_logger.error(
            f"Failed to initialize S3 singleton client: {exc}",
            exc_info=True,
        )
        s3_session = None
        s3_client = None


async def close_s3_client() -> None:
    """Tear down the singleton S3 client. Called once during FastAPI lifespan shutdown."""
    global s3_session, s3_client
    if s3_client is None:
        return

    try:
        await s3_client.__aexit__(None, None, None)
    except Exception as exc:
        global_logger.warning(f"Error closing S3 singleton client: {exc}", exc_info=True)
    finally:
        s3_client = None
        s3_session = None


async def get_s3_client():
    """Return the singleton S3 client, or raise 503 if it failed to start.

    Kept as an async callable (not a plain attribute) so existing
    `Depends(get_s3_client)` call sites in routes/media.py and
    routes/question.py continue to work without changes.
    """
    if s3_client is None:
        from fastapi import HTTPException
        # Don't leak storage details to the client; this should only fire if
        # startup hit an error and the operator hasn't restarted the app.
        raise HTTPException(
            status_code=503,
            detail="S3 client is unavailable. Please retry shortly.",
        )
    return s3_client
