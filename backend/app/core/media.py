"""Business logic for media proxy operations."""

import io

from googleapiclient.errors import HttpError
from googleapiclient.http import MediaIoBaseDownload

from logger import global_logger


_ALLOWED_MIME_TYPES: frozenset[str] = frozenset({
    # Images
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    # Audio
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
    "audio/webm",
    "audio/mp4",
    "audio/aac",
    # Video
    "video/mp4",
    "video/webm",
    "video/ogg",
    "video/quicktime",
})

# Default chunk size for streaming: 1 MB (must be a multiple of 256 KB for Drive API)
DEFAULT_CHUNK_SIZE = 1024 * 1024


def get_drive_file_info(
    google_drive_service, file_id: str
) -> tuple[str, int | None]:
    """Fetch MIME type and optional file size for a Google Drive file.

    Args:
        google_drive_service: Authenticated Google Drive API service instance.
        file_id: Google Drive file ID.

    Returns:
        A tuple of (mime_type, file_size_or_None).

    Raises:
        FileNotFoundError: If the file ID is not found (HTTP 404).
        PermissionError: If access is denied (HTTP 403).
        ValueError: If the file MIME type is not an allowed media type.
    """
    try:
        meta = google_drive_service.files().get(
            fileId=file_id, fields="mimeType,name,size"
        ).execute()
    except HttpError as exc:
        status = int(exc.resp.status) if exc.resp else 0
        if status == 404:
            raise FileNotFoundError(f"File '{file_id}' not found in Google Drive.")
        if status == 403:
            raise PermissionError(f"Access denied for Drive file '{file_id}'.")
        raise

    mime_type: str = meta.get("mimeType", "application/octet-stream")
    if mime_type not in _ALLOWED_MIME_TYPES:
        raise ValueError(f"Unsupported media type: {mime_type!r}")

    file_size: int | None = None
    if "size" in meta:
        try:
            file_size = int(meta["size"])
        except (ValueError, TypeError):
            pass

    global_logger.debug(
        f"Drive file {file_id!r} info: {mime_type}, {file_size or 'unknown'} bytes"
    )
    return mime_type, file_size


def stream_drive_file_chunks(
    google_drive_service,
    file_id: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
):
    """Yield chunks of a Google Drive file as they are downloaded.

    Each call to ``next_chunk()`` downloads one chunk from Google Drive
    and yields it immediately, keeping peak memory usage bounded to
    *chunk_size* regardless of total file size.

    Yields:
        bytes: A chunk of the file content.

    Raises:
        HttpError: If the Google Drive API returns an error during download.
    """
    request = google_drive_service.files().get_media(fileId=file_id)

    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=chunk_size)
    done = False
    while not done:
        _, done = downloader.next_chunk()
        chunk = buffer.getvalue()
        if chunk:
            yield chunk
        buffer.truncate(0)
        buffer.seek(0)

    global_logger.debug(f"Drive file {file_id!r} streaming complete.")


def resolve_drive_file_id_by_name(
    google_drive_service, file_name: str
) -> str:
    """Search Google Drive for a file by its exact name and return its ID.

    Searches across all non-trashed files (images, audio, video). If multiple
    files share the same name, the first result is returned.

    Args:
        google_drive_service: Authenticated Google Drive API service instance.
        file_name: Exact filename to search for (e.g. ``"cau1_anh.jpg"``).

    Returns:
        The Google Drive file ID.

    Raises:
        FileNotFoundError: If no file with the given name exists.
    """
    query = f"name = '{file_name}' and trashed = false"
    results = google_drive_service.files().list(
        q=query, fields="files(id, name, mimeType)", pageSize=10
    ).execute()
    files = results.get("files", [])

    if not files:
        raise FileNotFoundError(f"No Drive file found with name '{file_name}'.")

    # Prefer non-Google-Workspace files (actual media uploads)
    for f in files:
        mime = f.get("mimeType", "")
        if not mime.startswith("application/vnd.google-apps."):
            global_logger.debug(
                f"Resolved '{file_name}' → file_id={f['id']!r} ({mime})"
            )
            return f["id"]

    # Fallback: return the first result even if it's a Google Workspace file
    chosen = files[0]
    global_logger.warning(
        f"Resolved '{file_name}' → file_id={chosen['id']!r} "
        f"(Google Workspace type: {chosen.get('mimeType')})"
    )
    return chosen["id"]
