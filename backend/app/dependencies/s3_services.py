import aioboto3
from configs import S3Settings

_s3_settings = S3Settings()


def get_s3_settings() -> S3Settings:
    return _s3_settings


async def get_s3_client():
    session = aioboto3.Session(
        aws_access_key_id=_s3_settings.S3_ACCESS_KEY_ID,
        aws_secret_access_key=_s3_settings.S3_SECRET_ACCESS_KEY,
        region_name=_s3_settings.S3_REGION,
    )
    kwargs = {"endpoint_url": _s3_settings.S3_ENDPOINT_URL} if _s3_settings.S3_ENDPOINT_URL else {}
    async with session.client("s3", **kwargs) as client:
        yield client
