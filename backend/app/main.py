from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api import auth, match, answer, question, record
from dependencies.postgresql_db import Base, engine
from logger import global_logger


@asynccontextmanager
async def lifespan(app: FastAPI):
    global_logger.info("Application startup: Database engine initialized")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        global_logger.info("Database tables ensured.")
    yield
    global_logger.info("Application Shutdown: Disposing of database engine.")
    if engine: 
        await engine.dispose()
        global_logger.info("Database engine disposed.")



app = FastAPI(lifespan=lifespan, description="OLYMPIA CUSTOM 3 API MATCH ENDPOINTS", version="0.0.0")
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



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app="app.api.main:app", host="0.0.0.0", port=8000, reload=True)