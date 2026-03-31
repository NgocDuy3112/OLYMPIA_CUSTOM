# Tests for the media proxy endpoint (GET /media/drive/)

import sys
import os
import io

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
os.environ.setdefault("GOOGLE_DRIVE_SCOPE", "https://www.googleapis.com/auth/drive")
os.environ.setdefault("DRIVE_CREDENTIALS_FILE", "/tmp/fake_creds.json")

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient
from fastapi import HTTPException

from core.media import (
    _ALLOWED_MIME_TYPES,
    DEFAULT_CHUNK_SIZE,
    get_drive_file_info,
    stream_drive_file_chunks,
    resolve_drive_file_id_by_name,
)


# ── Core logic tests ─────────────────────────────────────────────────────────

class TestAllowedMimeTypes:
    """Verify the allowed MIME types set covers expected media formats."""

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
        for mime in ("application/pdf", "text/plain", "application/zip",
                     "application/vnd.google-apps.document"):
            assert mime not in _ALLOWED_MIME_TYPES


class TestGetDriveFileInfo:
    """Tests for get_drive_file_info()."""

    def test_returns_mime_and_size(self):
        mock_service = MagicMock()
        mock_service.files().get().execute.return_value = {
            "mimeType": "image/jpeg",
            "name": "photo.jpg",
            "size": "123456",
        }

        mime, size = get_drive_file_info(mock_service, "abc123")

        assert mime == "image/jpeg"
        assert size == 123456

    def test_returns_none_size_when_missing(self):
        mock_service = MagicMock()
        mock_service.files().get().execute.return_value = {
            "mimeType": "video/mp4",
            "name": "clip.mp4",
        }

        mime, size = get_drive_file_info(mock_service, "abc123")

        assert mime == "video/mp4"
        assert size is None

    def test_raises_on_unsupported_mime(self):
        mock_service = MagicMock()
        mock_service.files().get().execute.return_value = {
            "mimeType": "application/pdf",
            "name": "doc.pdf",
        }

        with pytest.raises(ValueError, match="Unsupported media type"):
            get_drive_file_info(mock_service, "abc123")

    def test_raises_file_not_found_on_404(self):
        from googleapiclient.errors import HttpError
        mock_service = MagicMock()
        mock_service.files().get().execute.side_effect = HttpError(
            MagicMock(status=404), b'{"error": "notFound"}'
        )

        with pytest.raises(FileNotFoundError, match="not found"):
            get_drive_file_info(mock_service, "nonexistent")

    def test_raises_permission_error_on_403(self):
        from googleapiclient.errors import HttpError
        mock_service = MagicMock()
        mock_service.files().get().execute.side_effect = HttpError(
            MagicMock(status=403), b'{"error": "forbidden"}'
        )

        with pytest.raises(PermissionError, match="Access denied"):
            get_drive_file_info(mock_service, "private-file")


class TestResolveDriveFileIdByName:
    """Tests for resolve_drive_file_id_by_name()."""

    def test_finds_file_by_name(self):
        mock_service = MagicMock()
        mock_service.files().list().execute.return_value = {
            "files": [
                {"id": "file123", "name": "cau1.jpg", "mimeType": "image/jpeg"},
            ]
        }

        file_id = resolve_drive_file_id_by_name(mock_service, "cau1.jpg")

        assert file_id == "file123"

    def test_prefers_non_google_workspace_files(self):
        mock_service = MagicMock()
        mock_service.files().list().execute.return_value = {
            "files": [
                {"id": "doc1", "name": "report", "mimeType": "application/vnd.google-apps.document"},
                {"id": "img1", "name": "report", "mimeType": "image/png"},
            ]
        }

        file_id = resolve_drive_file_id_by_name(mock_service, "report")

        # Should pick the image, not the Google Doc
        assert file_id == "img1"

    def test_raises_when_no_file_found(self):
        mock_service = MagicMock()
        mock_service.files().list().execute.return_value = {"files": []}

        with pytest.raises(FileNotFoundError, match="No Drive file found"):
            resolve_drive_file_id_by_name(mock_service, "missing.jpg")

    def test_falls_back_to_first_result_if_all_workspace(self):
        mock_service = MagicMock()
        mock_service.files().list().execute.return_value = {
            "files": [
                {"id": "doc1", "name": "report", "mimeType": "application/vnd.google-apps.spreadsheet"},
            ]
        }

        file_id = resolve_drive_file_id_by_name(mock_service, "report")
        assert file_id == "doc1"


class TestStreamDriveFileChunks:
    """Tests for stream_drive_file_chunks() generator."""

    def test_yields_chunks(self):
        """Verify the generator yields data from the download."""
        mock_service = MagicMock()
        mock_request = MagicMock()

        mock_service.files().get_media.return_value = mock_request

        # Simulate MediaIoBaseDownload behavior
        call_count = [0]
        original_init = None

        class FakeDownloader:
            def __init__(self, buf, req, chunksize=None):
                self.buf = buf
                self.call = 0

            def next_chunk(self):
                self.call += 1
                if self.call == 1:
                    self.buf.write(b"chunk1-data")
                    return (MagicMock(), False)
                elif self.call == 2:
                    self.buf.write(b"chunk2-data")
                    return (MagicMock(), True)
                return (MagicMock(), True)

        with patch("core.media.MediaIoBaseDownload", FakeDownloader):
            chunks = list(stream_drive_file_chunks(mock_service, "file123", chunk_size=1024))

        assert len(chunks) >= 1
        # Verify data was yielded
        all_data = b"".join(chunks)
        assert b"chunk" in all_data

    def test_uses_correct_file_id(self):
        """Verify the correct file ID is passed to the API."""
        mock_service = MagicMock()
        mock_service.files().get_media.return_value = MagicMock()

        with patch("core.media.MediaIoBaseDownload") as mock_dl:
            mock_dl.return_value.next_chunk.return_value = (MagicMock(), True)
            list(stream_drive_file_chunks(mock_service, "my-file-id"))

        mock_service.files().get_media.assert_called_once_with(fileId="my-file-id")
