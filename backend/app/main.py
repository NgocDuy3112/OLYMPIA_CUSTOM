from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from routes import (
    auth, 
    user,
    match, 
    answer,
    question, 
    record,
    scoreboard,
    qualifier,
    media,
)
from dependencies.postgresql_db import *
from dependencies.valkey_store import get_valkey
from dependencies.ws_manager import get_ws_manager
from dependencies.user_auth import get_ws_user
from utils.ws_connection import ConnectionManager
from logger import global_logger
from alembic.config import Config
from alembic import command
import asyncio
from pathlib import Path
from jwt import PyJWTError


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    global_logger.info("Application startup: Database engine initialized")
    
    valkey = None
    manager = await get_ws_manager()
    
    try:
        valkey = await get_valkey()
        manager.set_valkey(valkey)
        global_logger.info("WebSocket Connection Manager initialized with Valkey.")
    except Exception as e:
        global_logger.error(
            f"Failed to initialize Valkey connection: {str(e)}. "
            f"WebSocket pub/sub features will be unavailable. "
            f"Please verify VALKEY_HOST, VALKEY_PORT and VALKEY_PASSWORD environment variables.",
            exc_info=True
        )
        # Continue startup without Valkey - REST API will still work
    # Ensure database schema is up-to-date by running Alembic migrations.
    # Run upgrades in a thread to avoid nesting event loops (env.py uses asyncio.run()).
    alembic_applied = False
    try:
        def _run_alembic_upgrade():
            cfg_path = Path(__file__).resolve().parents[0] / "alembic.ini"
            cfg = Config(str(cfg_path))
            # alembic.env.py will set the sqlalchemy.url from app configs
            command.upgrade(cfg, "head")

        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, _run_alembic_upgrade)
        global_logger.info("Alembic migrations applied successfully.")
        alembic_applied = True
    except Exception as e:
        global_logger.error(f"Failed to apply Alembic migrations: {e}", exc_info=True)

    # Only run SQLAlchemy's metadata.create_all as a fallback when Alembic
    # migrations could not be applied. Running both can attempt to create the
    # same DB types (e.g., PostgreSQL ENUMs) twice and lead to "type already exists" errors.
    if not alembic_applied:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            global_logger.info("Database tables ensured via SQLAlchemy metadata.create_all.")
    
    yield
    
    # Cleanup code
    global_logger.info("Application Shutdown: Disposing of database engine.")
    
    # Gracefully shut down WebSocket ConnectionManager (cancel Valkey listeners)
    try:
        await manager.shutdown()
    except Exception as e:
        global_logger.warning(f"Error shutting down ConnectionManager: {e}")
    
    if valkey:
        try:
            await valkey.close()
            global_logger.info("Valkey connection pool closed.")
        except Exception as e:
            global_logger.warning(f"Error closing Valkey connection: {e}")
    
    if engine: 
        await engine.dispose()
        global_logger.info("Database engine disposed.")



app = FastAPI(lifespan=lifespan, description="OLYMPIA CUSTOM 3 MATCH - API ENDPOINTS", version="0.0.1")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": exc.detail, "data": None},
    )


@app.get("/health")
def health_check():
    return {"status": "healthy"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],  # Vite dev server; override in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(match.router)
app.include_router(answer.router)
app.include_router(question.router)
app.include_router(record.router)
app.include_router(scoreboard.router)
app.include_router(qualifier.router)
app.include_router(media.router)



@app.websocket("/ws/{match_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    match_code: str,
    token: str | None = Query(None, description="JWT access token"),
):
    # ── Authenticate WebSocket connection ─────────────────────────────────
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        return

    try:
        user_info = get_ws_user(token)
    except PyJWTError:
        await websocket.close(code=4001, reason="Invalid authentication token")
        return
    except Exception:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    global_logger.info(
        f"WebSocket authenticated: user={user_info['user_code']!r} "
        f"role={user_info['role']!r} room={match_code!r}"
    )

    ws_manager: ConnectionManager = await get_ws_manager()
    await ws_manager.connect(websocket, match_code)

    try:
        while True:
            data = await websocket.receive_json()
            # Inject authenticated user info into inbound messages
            data["user_code"] = user_info["user_code"]
            data["role"] = user_info["role"]
            global_logger.info(
                f"Received message from {user_info['user_code']!r} "
                f"in room {match_code!r}: {data}"
            )
            await ws_manager.broadcast_to_room(match_code, data)

    except WebSocketDisconnect:
        global_logger.info(
            f"WebSocket disconnected: {user_info['user_code']!r} room={match_code!r}"
        )

    except Exception as e:
        global_logger.error(
            f"WebSocket error in room {match_code!r} for "
            f"{user_info['user_code']!r}: {e}",
            exc_info=True,
        )

    finally:
        ws_manager.disconnect(websocket, match_code)