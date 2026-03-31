"""Media proxy route — streams media files from Google Drive."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Query, Depends, HTTPException
from fastapi.responses import StreamingResponse

from dependencies.user_auth import require_roles
from dependencies.gcp_services import get_google_drive_service
from core.media import (
    get_drive_file_info,
    stream_drive_file_chunks,
    resolve_drive_file_id_by_name,
)
from logger import global_logger


router = APIRouter(prefix="/media", tags=["Media"])


@router.get(
    "/drive/",
    dependencies=[Depends(require_roles(["admin", "player"]))],
    status_code=200,
    summary="Stream a media file from Google Drive",
    description=(
        "Download and stream an image, audio, or video file from Google Drive. "
        "Identify the file by either ``file_id`` (Drive file ID) or ``file_name`` "
        "(exact filename, e.g. ``cau1_anh.jpg``). "
        "Only image/*, audio/*, and video/* MIME types are proxied. "
        "Responses are cached on the client for one hour."
    ),
)
async def get_drive_media(
    file_id: Annotated[str | None, Query(description="Google Drive file ID")] = None,
    file_name: Annotated[str | None, Query(description="Exact filename in Google Drive (e.g. cau1_anh.jpg)")] = None,
    google_drive_service=Depends(get_google_drive_service),
) -> StreamingResponse:
    """Stream a Google Drive media file to the client using chunked transfer."""
    if not file_id and not file_name:
        raise HTTPException(
            status_code=400,
            detail="Either file_id or file_name must be provided.",
        )
    if file_id and file_name:
        raise HTTPException(
            status_code=400,
            detail="Provide only one of file_id or file_name, not both.",
        )

    global_logger.info(
        f"Media proxy request: file_id={file_id!r}, file_name={file_name!r}"
    )
    try:
        loop = asyncio.get_running_loop()

        # Resolve file_id from name if needed
        effective_file_id = file_id
        if file_name:
            effective_file_id = await loop.run_in_executor(
                None, resolve_drive_file_id_by_name, google_drive_service, file_name
            )

        # Fetch MIME type and optional file size
        mime_type, file_size = await loop.run_in_executor(
            None, get_drive_file_info, google_drive_service, effective_file_id
        )

        # Stream chunks
        headers: dict[str, str] = {
            "Cache-Control": "private, max-age=3600",
        }
        if file_size is not None:
            headers["Content-Length"] = str(file_size)

        return StreamingResponse(
            stream_drive_file_chunks(google_drive_service, effective_file_id),
            media_type=mime_type,
            headers=headers,
        )

    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        global_logger.error(
            f"Unexpected error fetching Drive media: {exc}", exc_info=True
        )
        raise HTTPException(status_code=500, detail="Failed to fetch media from Google Drive.")
