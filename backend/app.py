from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from src.database import open_pool, close_pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_in_threadpool(open_pool)

    try:
        yield
    finally:
        await run_in_threadpool(close_pool)


app = FastAPI(
    title="AI Career Coach",
    lifespan=lifespan,
)


@app.get("/api/health")
def health():
    return {"status": "ok"}