from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.concurrency import run_in_threadpool

from src.database import open_pool, close_pool

from uuid import UUID

import psycopg
from fastapi import HTTPException

from src import repository
from src.schemas import IntakeData, WorkspaceResponse, CVReview, CVReviewResponse 

from src.schemas import ExtractionResponse 

from fastapi.middleware.cors import CORSMiddleware

from openai import (
    APIError,
    APITimeoutError,
    AuthenticationError,
    RateLimitError,
)
from pydantic import ValidationError

from src.ai_cv import generate_cv_review, ReviewGenerationError

from src.schemas import WorkspaceUpdateRequest
from src.schemas import CVReviewLookupResponse

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
    allow_methods=["GET", "POST", "PUT", "DELETE"],
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

@app.post(
    "/api/workspaces/{workspace_id}/review",
    response_model=CVReviewResponse,
)
def create_cv_review(workspace_id: UUID):
    try:
        workspace = repository.get_workspace(str(workspace_id))

        if workspace is None:
            raise HTTPException(404, "Workspace not found.")

        intake = IntakeData.model_validate(workspace["intake"])

        if not intake.cv_text.strip():
            raise HTTPException(
                422,
                "Add and confirm CV text before requesting a review.",
            )

        # Keep the exact version used for generation.
        intake_version = workspace["intake_version"]

        # The repository has already returned its DB connection.
        review, metadata = generate_cv_review(intake)

        artifact = repository.save_artifact(
            workspace_id=str(workspace_id),
            kind="review",
            output=review.model_dump(mode="json"),
            intake_version=intake_version,
            meta=metadata,
        )

        return {
            "id": artifact["id"],
            "workspace_id": workspace_id,
            "intake_version": intake_version,
            "review": review,
            "created_at": artifact["created_at"],
        }

    except APITimeoutError:
        raise HTTPException(
            504, "Review generation timed out. Please retry."
        ) from None

    except AuthenticationError:
        raise HTTPException(
            503, "The AI service credentials need configuration."
        ) from None

    except RateLimitError:
        raise HTTPException(
            503, "The AI service limit was reached. Please try later."
        ) from None

    except APIError:
        raise HTTPException(
            502,
            "The AI request failed. Check the configured model and service.",
        ) from None

    except (ReviewGenerationError, ValidationError):
        raise HTTPException(
            502, "A valid review could not be produced. Please retry."
        ) from None

    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503,
            "The database operation failed. The review may not be saved.",
        ) from None

    except RuntimeError:
        raise HTTPException(
            503, "CV review is not configured on the backend."
        ) from None


@app.get(
    "/api/workspaces/{workspace_id}/review",
    response_model=CVReviewLookupResponse,
)
def load_cv_review(workspace_id: UUID):
    try:
        workspace = repository.get_workspace(str(workspace_id))

        if workspace is None:
            raise HTTPException(404, "Workspace not found.")

        artifact = repository.get_latest_artifact(
            workspace_id=str(workspace_id),
            kind="review",
            intake_version=workspace["intake_version"],
        )

        if artifact is None:
            return {
                "found": False,
                "message": "No saved review for the current CV details.",
                "result": None,
            }

        return {
            "found": True,
            "message": "Saved review loaded.",
            "result": {
                "id": artifact["id"],
                "workspace_id": workspace_id,
                "intake_version": artifact["intake_version"],
                "review": CVReview.model_validate(artifact["output"]),
                "created_at": artifact["created_at"],
            },
        }

    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503,
            "Database unavailable. Please try again.",
        ) from None

@app.put(
    "/api/workspaces/{workspace_id}",
    response_model=WorkspaceResponse,
)
def update_workspace(
    workspace_id: UUID,
    request: WorkspaceUpdateRequest,
):
    try:
        existing = repository.get_workspace(str(workspace_id))

        if existing is None:
            raise HTTPException(404, "Workspace not found.")

        return repository.update_intake(
            workspace_id=str(workspace_id),
            intake=request.intake.model_dump(mode="json"),
            expected_version=request.expected_version,
        )

    except repository.ConflictError:
        raise HTTPException(
            409,
            "These details changed elsewhere. Reopen the session before editing.",
        ) from None

    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503, "Database unavailable. Please try again."
        ) from None


@app.delete(
    "/api/workspaces/{workspace_id}",
    status_code=204,
)
def delete_workspace(workspace_id: UUID):
    try:
        deleted = repository.delete_workspace(str(workspace_id))
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503, "Database unavailable. Please try again."
        ) from None

    if not deleted:
        raise HTTPException(404, "Workspace not found.")

    return None

