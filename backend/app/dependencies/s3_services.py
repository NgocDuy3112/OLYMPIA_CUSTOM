import aioboto3
from botocore.config import Config
from configs import S3Settings

_s3_settings = S3Settings()

# Force path-style addressing for S3-compatible providers (Vietnix, MinIO, etc.)
# Virtual-hosted-style (default) fails when the endpoint is not AWS S3.
_S3_CONFIG = Config(
    s3={"addressing_style": "path"},
    signature_version='s3',
    retries={'max_attempts': 3}
)


def get_s3_settings() -> S3Settings:
    return _s3_settings


async def get_s3_client():
    session = aioboto3.Session(
        aws_access_key_id=_s3_settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=_s3_settings.S3_SECRET_ACCESS_KEY,
        region_name=_s3_settings.S3_REGION,
    )
    async with session.client(
        "s3",
        endpoint_url=_s3_settings.S3_ENDPOINT_URL,
        config=_S3_CONFIG
    ) as s3_client:
        yield s3_client
