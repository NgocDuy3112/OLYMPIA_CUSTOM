import aioboto3
from botocore.config import Config
from configs import S3Settings
from logger import global_logger

s3_settings = S3Settings()


S3_CONFIG = Config(
    s3={"addressing_style": "path"},
    signature_version='s3',
    retries={'max_attempts': 1},
    connect_timeout=3,
    read_timeout=5,
    max_pool_connections=50,
)


def gets3_settings() -> S3Settings:
    return s3_settings


s3_session: aioboto3.Session | None = None
s3_client = None


def _build_session() -> aioboto3.Session:
    return aioboto3.Session(
        aws_access_key_id=s3_settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=s3_settings.S3_SECRET_ACCESS_KEY,
        region_name=s3_settings.S3_REGION,
    )


async def init_s3_client() -> None:
    global s3_session, s3_client
    if s3_client is not None:
        return

    try:
        s3_session = _build_session()


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
    if s3_client is None:
        from fastapi import HTTPException


        raise HTTPException(
            status_code=503,
            detail="S3 client is unavailable. Please retry shortly.",
        )
    return s3_client
