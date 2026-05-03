import mimetypes
from fastapi import UploadFile, HTTPException
from logger import global_logger

_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/aac",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
})


async def upload_file_to_s3(
    file: UploadFile,
    match_code: str,
    s3_client,
    bucket: str,
    max_size_bytes: int,
) -> str:
    """Upload a media file to S3 under {match_code}/{filename}. Returns the S3 object key."""
    content_type = file.content_type or ""
    if not content_type or content_type == "application/octet-stream":
        guessed, _ = mimetypes.guess_type(file.filename or "")
        content_type = guessed or "application/octet-stream"

    if content_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported media type: {content_type!r}. Allowed: image/*, audio/*, video/*",
        )

    data = await file.read()

    if len(data) > max_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {len(data)} bytes (max {max_size_bytes} bytes).",
        )

    key = f"{match_code}/{file.filename}"

    try:
        await s3_client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
    except Exception as exc:
        global_logger.error(f"S3 upload failed for key={key!r}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload file to S3.")

    global_logger.info(f"S3 upload complete: bucket={bucket!r} key={key!r}")
    return key


async def generate_presigned_url(
    s3_client,
    bucket: str,
    key: str,
    expiry: int,
) -> str:
    """Generate a presigned GET URL for an S3 object. Raises 404 if object doesn't exist."""
    try:
        await s3_client.head_object(Bucket=bucket, Key=key)
    except Exception as exc:
        error_code = ""
        try:
            error_code = exc.response["Error"]["Code"]
        except Exception:
            pass
        if error_code in ("404", "NoSuchKey"):
            raise HTTPException(status_code=404, detail=f"Media not found: {key!r}")
        global_logger.error(f"S3 head_object error for key={key!r}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="S3 error checking media existence.")

    try:
        url = await s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiry,
        )
    except Exception as exc:
        global_logger.error(f"Failed to generate presigned URL for key={key!r}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate media URL.")

    global_logger.debug(f"Presigned URL generated for key={key!r}, expiry={expiry}s")
    return url
