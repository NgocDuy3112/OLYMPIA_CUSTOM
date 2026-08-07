import os

from fastapi import FastAPI, Request, WebSocket, Query, HTTPException
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
    gm,
)
from sqlalchemy import text
from dependencies.postgresql_db import *
from dependencies.valkey_store import get_valkey
from dependencies.s3_services import init_s3_client, close_s3_client
from dependencies.ws_manager import get_ws_manager
from logger import global_logger
from utils.ws_endpoint import websocket_endpoint_handler


@asynccontextmanager
async def lifespan(app: FastAPI):

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

    await init_s3_client()

    async with engine.begin() as conn:
        await conn.execute(text(
            "DO $$ BEGIN "
            "CREATE TYPE roleenum AS ENUM ('guest', 'player', 'mc', 'admin'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; "
            "END $$"
        ))
        await conn.run_sync(Base.metadata.create_all)
        global_logger.info("Database tables ensured via SQLAlchemy metadata.create_all.")

    yield


    global_logger.info("Application Shutdown: Disposing of database engine.")


    try:
        await manager.shutdown()
    except Exception as e:
        global_logger.warning(f"Error shutting down ConnectionManager: {e}", exc_info=True)

    if valkey:
        try:
            await valkey.close()
            global_logger.info("Valkey connection pool closed.")
        except Exception as e:
            global_logger.warning(f"Error closing Valkey connection: {e}", exc_info=True)


    await close_s3_client()

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


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    global_logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error", "data": None},
    )


@app.get("/health")
def health_check():
    return {"status": "healthy"}


cors_origins = os.getenv("CORS_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in cors_origins.split(",") if o.strip()] if cors_origins else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
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
app.include_router(gm.router)


@app.websocket("/ws/{match_code}")
async def websocket_endpoint(
    websocket: WebSocket,
    match_code: str,
    token: str | None = Query(None, description="JWT access token"),
):
    await websocket_endpoint_handler(websocket, match_code, token)