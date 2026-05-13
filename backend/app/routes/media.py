from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, UploadFile
from fastapi.responses import RedirectResponse

from dependencies.user_auth import require_roles
from dependencies.s3_services import get_s3_client, _s3_settings
from core.media import upload_file_to_s3, generate_presigned_url


router = APIRouter(prefix="/media", tags=["Media"])


@router.post(
    "/upload/",
    dependencies=[Depends(require_roles(["admin"]))],
    status_code=201,
    summary="Upload a media file to S3",
    description=(
        "Upload an image, audio, or video file to S3. "
        "Returns the S3 object key to store in questions.media_url."
    ),
)
async def upload_media(
    match_code: str,
    file: UploadFile = File(...),
    s3_client=Depends(get_s3_client),
) -> dict[str, str]:
    key = await upload_file_to_s3(
        file=file,
        match_code=match_code,
        s3_client=s3_client,
        bucket=_s3_settings.S3_BUCKET_NAME,
        max_size_bytes=_s3_settings.S3_MAX_UPLOAD_SIZE_MB * 1024 * 1024,
    )
    return {"key": key}


@router.get(
    "/",
    dependencies=[Depends(require_roles(["admin", "player", "mc"]))],
    status_code=307,
    summary="Get a presigned URL for a media file",
    description=(
        "Generate a presigned S3 URL and redirect the client directly to it. "
        "URL is valid for the duration configured in S3_PRESIGNED_URL_EXPIRY."
    ),
)
async def get_media(
    key: Annotated[str, Query(description="S3 object key, e.g. OC3_M01T/OC3_Q_KD_1_1.png")],
    s3_client=Depends(get_s3_client),
) -> RedirectResponse:
    url = await generate_presigned_url(
        s3_client=s3_client,
        bucket=_s3_settings.S3_BUCKET_NAME,
        key=key,
        expiry=_s3_settings.S3_PRESIGNED_URL_EXPIRY,
    )
    return RedirectResponse(url=url, status_code=307)


@router.get(
    "/presign/",
    dependencies=[Depends(require_roles(["admin", "player", "mc"]))],
    summary="Get presigned S3 URL as JSON",
    description=(
        "Returns the presigned S3 URL as JSON instead of a redirect, "
        "allowing the frontend to use it directly as a media src for streaming."
    ),
)
async def get_presigned_url(
    key: Annotated[str, Query(description="S3 object key, e.g. OC3_M01T/clip.mp4")],
    s3_client=Depends(get_s3_client),
) -> dict[str, str]:
    url = await generate_presigned_url(
        s3_client=s3_client,
        bucket=_s3_settings.S3_BUCKET_NAME,
        key=key,
        expiry=_s3_settings.S3_PRESIGNED_URL_EXPIRY,
    )
    return {"url": url}
