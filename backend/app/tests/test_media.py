# Tests for S3 media upload and presigned URL generation.

import sys
import os

ROOT = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, os.path.join(ROOT, 'app'))

os.environ.setdefault("POSTGRES_DB_USER", "test")
os.environ.setdefault("POSTGRES_DB_PASSWORD", "test")
os.environ.setdefault("POSTGRES_DB_HOST", "localhost")
os.environ.setdefault("POSTGRES_DB_PORT", "5432")
os.environ.setdefault("POSTGRES_DB_NAME", "testdb")
os.environ.setdefault("APP_HOST", "localhost")
os.environ.setdefault("APP_PORT", "8000")
os.environ.setdefault("SECRET_KEY", "secretkeyforlocaldev")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")
os.environ.setdefault("S3_BUCKET_NAME", "test-bucket")
os.environ.setdefault("S3_ACCESS_KEY_ID", "test-key-id")
os.environ.setdefault("S3_SECRET_ACCESS_KEY", "test-secret")
os.environ.setdefault("S3_REGION", "us-east-1")

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from io import BytesIO

from core.media import _ALLOWED_MIME_TYPES, upload_file_to_s3, generate_presigned_url


# ── Allowed MIME types ────────────────────────────────────────────────────────

class TestAllowedMimeTypes:
    def test_image_types_allowed(self):
        for mime in ("image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"):
            assert mime in _ALLOWED_MIME_TYPES

    def test_audio_types_allowed(self):
        for mime in ("audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/aac"):
            assert mime in _ALLOWED_MIME_TYPES

    def test_video_types_allowed(self):
        for mime in ("video/mp4", "video/webm", "video/ogg", "video/quicktime"):
            assert mime in _ALLOWED_MIME_TYPES

    def test_non_media_types_rejected(self):
        for mime in ("application/pdf", "text/plain", "application/zip"):
            assert mime not in _ALLOWED_MIME_TYPES


# ── upload_file_to_s3 ─────────────────────────────────────────────────────────

def _make_upload_file(filename: str, content: bytes, content_type: str):
    from fastapi import UploadFile
    f = UploadFile(filename=filename, file=BytesIO(content))
    f.content_type = content_type
    return f


class TestUploadFileToS3:
    @pytest.mark.asyncio
    async def test_upload_success_returns_key(self):
        file = _make_upload_file("OC3_Q_KD_1_1.png", b"fake-image-data", "image/png")
        s3_client = AsyncMock()
        s3_client.put_object = AsyncMock()

        key = await upload_file_to_s3(file, "OC3_M01T", s3_client, "oc3", 10 * 1024 * 1024)

        assert key == "OC3_M01T/OC3_Q_KD_1_1.png"
        s3_client.put_object.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_upload_rejects_unsupported_mime(self):
        file = _make_upload_file("doc.pdf", b"data", "application/pdf")
        s3_client = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await upload_file_to_s3(file, "OC3_M01T", s3_client, "oc3", 10 * 1024 * 1024)

        assert exc_info.value.status_code == 400
        assert "Unsupported" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_upload_rejects_oversized_file(self):
        file = _make_upload_file("big.jpg", b"x" * 100, "image/jpeg")
        s3_client = AsyncMock()

        with pytest.raises(HTTPException) as exc_info:
            await upload_file_to_s3(file, "OC3_M01T", s3_client, "oc3", max_size_bytes=50)

        assert exc_info.value.status_code == 400
        assert "too large" in exc_info.value.detail

    @pytest.mark.asyncio
    async def test_upload_s3_failure_raises_500(self):
        file = _make_upload_file("img.jpg", b"data", "image/jpeg")
        s3_client = AsyncMock()
        s3_client.put_object = AsyncMock(side_effect=Exception("connection error"))

        with pytest.raises(HTTPException) as exc_info:
            await upload_file_to_s3(file, "OC3_M01T", s3_client, "oc3", 10 * 1024 * 1024)

        assert exc_info.value.status_code == 500

    @pytest.mark.asyncio
    async def test_key_uses_match_code_prefix(self):
        file = _make_upload_file("audio.mp3", b"data", "audio/mpeg")
        s3_client = AsyncMock()
        s3_client.put_object = AsyncMock()

        key = await upload_file_to_s3(file, "OC3_M_VE_DICH", s3_client, "oc3", 10 * 1024 * 1024)

        assert key.startswith("OC3_M_VE_DICH/")
        assert key == "OC3_M_VE_DICH/audio.mp3"


# ── generate_presigned_url ────────────────────────────────────────────────────

class TestGeneratePresignedUrl:
    @pytest.mark.asyncio
    async def test_returns_presigned_url(self):
        s3_client = AsyncMock()
        s3_client.head_object = AsyncMock()
        s3_client.generate_presigned_url = AsyncMock(
            return_value="https://oc3.s3.example.com/OC3_M01T/img.png?X-Amz-Signature=abc"
        )

        url = await generate_presigned_url(s3_client, "oc3", "OC3_M01T/img.png", expiry=3600)

        assert url.startswith("https://")
        s3_client.head_object.assert_awaited_once_with(Bucket="oc3", Key="OC3_M01T/img.png")

    @pytest.mark.asyncio
    async def test_raises_404_when_object_missing(self):
        s3_client = AsyncMock()
        error = Exception("Not Found")
        error.response = {"Error": {"Code": "404"}}
        s3_client.head_object = AsyncMock(side_effect=error)

        with pytest.raises(HTTPException) as exc_info:
            await generate_presigned_url(s3_client, "oc3", "OC3_M01T/missing.png", expiry=3600)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_raises_500_when_presign_fails(self):
        s3_client = AsyncMock()
        s3_client.head_object = AsyncMock()
        s3_client.generate_presigned_url = AsyncMock(side_effect=Exception("signing error"))

        with pytest.raises(HTTPException) as exc_info:
            await generate_presigned_url(s3_client, "oc3", "OC3_M01T/img.png", expiry=3600)

        assert exc_info.value.status_code == 500
