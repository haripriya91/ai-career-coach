from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from src.database import open_pool, close_pool

from uuid import UUID

import psycopg
from fastapi import HTTPException

from src import repository
from src.schemas import IntakeData, WorkspaceResponse 

from src.schemas import ExtractionResponse 

from fastapi.middleware.cors import CORSMiddleware


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


# Allow the deployed frontend and local development frontend
# to make browser requests to this API.
# CORS does not provide authentication or conversation ownership checks.

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Replace this with your deployed CareerPilot AI frontend URL.
        "https://your-careerpilot-frontend.vercel.app",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


from fastapi import File, HTTPException, UploadFile
from src.document_tools import (
    DocumentExtractionError,
    MAX_UPLOAD_BYTES,
    extract_text,
)

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.post(
    "/api/cv/extract",
    response_model=ExtractionResponse,
)
async def extract_cv(file: UploadFile = File(...)):
    """Extract text from an uploaded PDF or DOCX CV."""
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Please upload a file with a filename.",
        )

    try:
        file_bytes = await file.read(MAX_UPLOAD_BYTES + 1)

        if len(file_bytes) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File is too large. Maximum upload size is 2 MB.",
            )

        extracted_text = await run_in_threadpool(    extract_text,    file_bytes,    file.filename,)

        return ExtractionResponse(
            filename=file.filename,
            extracted_text=extracted_text,
            warnings=[],
        )

    except DocumentExtractionError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    finally:
        await file.close()


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

