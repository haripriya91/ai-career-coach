from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from src.database import open_pool, close_pool

from uuid import UUID

import psycopg
from fastapi import HTTPException

from src import repository
from src.schemas import IntakeData, WorkspaceResponse


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

@app.post(
    "/api/workspaces",
    response_model=WorkspaceResponse,
    status_code=201,
)
def create_workspace(intake: IntakeData):
    try:
        return repository.create_workspace(
            intake.model_dump(mode="json")
        )
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None


@app.get(
    "/api/workspaces/{workspace_id}",
    response_model=WorkspaceResponse,
)
def load_workspace(workspace_id: UUID):
    try:
        workspace = repository.get_workspace(str(workspace_id))
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    if workspace is None:
        raise HTTPException(
            status_code=404,
            detail="Workspace not found.",
        )

    return workspace