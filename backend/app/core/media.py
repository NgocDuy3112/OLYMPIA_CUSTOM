import mimetypes
from fastapi import UploadFile, HTTPException
from logger import global_logger
from dependencies.valkey_store import get_valkey

_EXT_TO_MIME: dict[str, str] = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
    "mp3": "audio/mpeg", "ogg": "audio/ogg", "wav": "audio/wav",
    "aac": "audio/aac", "m4a": "audio/mp4", "flac": "audio/flac",
    "mp4": "video/mp4", "webm": "video/webm", "ogv": "video/ogg", "mov": "video/quicktime",
}

_PRESIGN_CACHE_TTL_SECONDS = 300

_PRESIGN_CACHE_CONTROL = "public, max-age=600"

_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/aac",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
})


def _guess_mime_from_key(key: str) -> str | None:
    filename = key.rsplit("/", 1)[-1]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _EXT_TO_MIME.get(ext)


async def upload_file_to_s3(
    file: UploadFile,
    match_code: str,
    s3_client,
    bucket: str,
    max_size_bytes: int,
) -> str:
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


def _build_presign_params(bucket: str, key: str) -> dict:
    params: dict = {"Bucket": bucket, "Key": key}
    mime = _guess_mime_from_key(key)
    if mime:
        params["ResponseContentType"] = mime
    params["ResponseCacheControl"] = _PRESIGN_CACHE_CONTROL
    return params


async def _presign_and_cache(s3_client, bucket: str, key: str, expiry: int) -> str:
    params = _build_presign_params(bucket, key)
    try:
        url = await s3_client.generate_presigned_url(
            "get_object",
            Params=params,
            ExpiresIn=expiry,
        )
    except Exception as exc:
        global_logger.error(f"Failed to generate presigned URL for key={key!r}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate media URL.")

    try:
        valkey = await get_valkey()
        cache_key = f"media:presign:{bucket}:{key}"
        await valkey.set(cache_key, url, ex=_PRESIGN_CACHE_TTL_SECONDS)
    except Exception as exc:
        global_logger.warning(f"Failed to cache presigned URL for key={key!r}: {exc}")

    global_logger.debug(f"Presigned URL generated for key={key!r}, expiry={expiry}s")
    return url


async def generate_presigned_url(
    s3_client,
    bucket: str,
    key: str,
    expiry: int,
) -> str:
    cache_key = f"media:presign:{bucket}:{key}"
    try:
        valkey = await get_valkey()
        cached = await valkey.get(cache_key)
        if cached:
            global_logger.debug(f"Presigned URL cache hit for key={key!r}")
            return cached
    except Exception as exc:
        global_logger.warning(f"Presign cache read failed for key={key!r}: {exc}")

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

    return await _presign_and_cache(s3_client, bucket, key, expiry)


_PRESIGN_BATCH_MAX_KEYS = 50


async def generate_presigned_urls_batch(
    s3_client,
    bucket: str,
    keys: list[str],
    expiry: int,
) -> dict[str, str]:
    if not keys:
        raise HTTPException(status_code=400, detail="`keys` must be a non-empty list.")
    if len(keys) > _PRESIGN_BATCH_MAX_KEYS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many keys: {len(keys)} (max {_PRESIGN_BATCH_MAX_KEYS}).",
        )

    urls: dict[str, str] = {}
    for key in keys:
        try:
            url = await generate_presigned_url(s3_client, bucket, key, expiry)
            urls[key] = url
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            global_logger.warning(f"presign-batch skipped missing key={key!r}")
    return urls
