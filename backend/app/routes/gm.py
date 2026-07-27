"""REST routes for the Giải Mã (Decode) round.

These endpoints expose the server-authoritative admin-state snapshot
(``gm:admin_state:{match_code}`` HASH, populated by the
``apply_gm_admin_state`` companion in
``backend/app/utils/ws_message_processor.py``) so a refreshed admin
tab can re-hydrate its ``useState`` without depending on a remembered
local copy.

Why a REST endpoint (not a WS event)?
-------------------------------------

The admin tab is the *source* of every WS event in this round (the
only thing the player/MC tabs do is echo back what the admin sent).
A WS event pushed to the admin tab on mount would mean the admin
would also be re-broadcasting its own state out to the room, which
adds noise without value. The REST endpoint is admin-only (auth via
JWT, admin or super-user role) and returns the full snapshot in one
shot so the React ``useEffect`` on mount can call it once and
``setState`` for every field.

If a future round needs MC/player re-hydration from this snapshot
(e.g., a future annotation overlay), the same endpoint can be opened
to other roles — the body schema is generic enough that no change to
the storage layer is needed.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Annotated

from dependencies.postgresql_db import get_db
from dependencies.valkey_store import get_valkey
from dependencies.user_auth import require_roles
from schemas.base import BaseResponse
from utils.gm_admin_state import get_admin_state


router = APIRouter(prefix="/gm", tags=["Giải Mã"])


@router.get(
    "/admin-state",
    dependencies=[Depends(require_roles(["admin"]))],
    response_model=BaseResponse,
)
async def get_gm_admin_state(
    match_code: str = Query(..., description="Match code to fetch the GM admin-state snapshot for"),
    valkey=Depends(get_valkey),
) -> BaseResponse:
    """Return the per-match GM admin-state snapshot.

    The response ``data`` is the parsed ``gm:admin_state:{match_code}``
    HASH. Empty ``data`` means no admin action has happened yet for
    this match — the admin tab should treat this as a fresh round (its
    ``useState`` defaults already match the empty state, so no UI work
    is needed).

    See ``utils/gm_admin_state.py`` for the field list and the
    ``apply_gm_admin_state`` companion in
    ``utils/ws_message_processor.py`` for which WS events populate each
    field.

    Failure modes:

    - Valkey unreachable → ``data`` is ``{}`` (same as fresh state). The
      admin tab still works for the current session via local
      ``useState``; only the re-hydration path is degraded.
    - ``match_code`` missing → 422 from FastAPI's query-param validation.
    """
    if not match_code:
        raise HTTPException(status_code=400, detail="match_code is required")

    snapshot = await get_admin_state(valkey, match_code)
    return BaseResponse(
        status="success",
        message="GM admin-state snapshot fetched",
        data=snapshot or {},
    )
