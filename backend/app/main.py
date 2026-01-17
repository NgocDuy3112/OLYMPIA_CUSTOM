from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api import (
    auth, 
    match, 
    answer,
    question, 
    record, 
    leaderboard
)
from dependencies.postgresql_db import *
from dependencies.valkey_store import get_valkey
from dependencies.ws_manager import get_ws_manager
from utils.ws_connection import ConnectionManager
from logger import global_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup code
    global_logger.info("Application startup: Database engine initialized")
    valkey = await get_valkey()
    manager = await get_ws_manager()
    manager.set_valkey(valkey)
    global_logger.info("WebSocket Connection Manager initialized with Valkey.")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        global_logger.info("Database tables ensured.")
    yield
    # Cleanup code
    global_logger.info("Application Shutdown: Disposing of database engine.")
    if valkey:
        await valkey.close()
        global_logger.info("Valkey connection pool closed.")
    if engine: 
        await engine.dispose()
        global_logger.info("Database engine disposed.")



app = FastAPI(lifespan=lifespan, description="OLYMPIA CUSTOM 3 MATCH - API ENDPOINTS", version="0.0.1")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth.router)
app.include_router(match.router)
app.include_router(answer.router)
app.include_router(question.router)
app.include_router(record.router)
app.include_router(leaderboard.router)



@app.websocket(
    "/ws/{match_code}",
)
async def websocket_endpoint(websocket: WebSocket, match_code: str):
    ws_manager: ConnectionManager = await get_ws_manager()
    await ws_manager.connect(websocket, match_code)
    try:
        while True:
            data = await websocket.receive_json()
            global_logger.info(f"Received message from {websocket.client} in room {match_code}: {data}")
            await ws_manager.broadcast_to_room(match_code, {"message": data})
    except Exception as e:
        global_logger.error(f"WebSocket error in room {match_code} for {websocket.client}: {e}")
    finally:
        ws_manager.disconnect(websocket, match_code)