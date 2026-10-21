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

from uuid import uuid4

from src.schemas import (
    IntakeData,
    WorkspaceResponse,
    ExtractionResponse,
    InterviewStartRequest,
    InterviewAnswerRequest,
    InterviewQuestion,
    InterviewTurn,
    InterviewResponse,
    InterviewFeedback,
)

from src.ai_interview import (
    generate_first_question,
    generate_next_question,
    decide_follow_up,
    generate_interview_feedback,
    InterviewGenerationError,
)

from src.interview_state import (
    InterviewStateError,
    record_answer,
)

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

from src.schemas import JobFitLookupResponse, JobFitResult

from src.job_fit_service import (
    generate_job_fit,
    JobFitInputError,
    JobFitGenerationError,
)

from src.schemas import RoadmapRequest, RoadmapLookupResponse

from src.roadmap_service import (
    create_saved_roadmap,
    load_saved_roadmap,
    RoadmapInputError,
    RoadmapGenerationError,
    RoadmapChangedError,
    RoadmapNotFoundError,
)

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
    "/api/interviews",
    response_model=InterviewResponse,
    status_code=201,
)
def start_interview(request: InterviewStartRequest):
    """Create an interview and generate its first question."""

    # 1. Find the workspace.
    try:
        workspace = repository.get_workspace(
            str(request.workspace_id)
        )
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

    # 2. Create the initial interview state.
    initial_state = {
        "question_count": request.question_count,
        "main_questions_asked": 0,
        "follow_ups_asked": 0,
        "current_question": None,
        "turns": [],
    }

    try:
        interview = repository.create_interview(
            str(request.workspace_id),
            initial_state,
        )
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail="Workspace not found.",
        ) from None
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    # 3. Generate the first question using the saved intake snapshot.
    try:
        generated = generate_first_question(
            interview["intake_snapshot"]
        )
    except InterviewGenerationError as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not generate the first question. "
                "Please try again. The interview was saved."
            ),
        ) from exc

    # 4. The backend, not the AI, assigns the question ID and kind.
    question = {
        "id": str(uuid4()),
        "text": generated["text"],
        "topic": generated["topic"],
        "kind": "main",
    }

    # 5. Save the pending question and update the interview version.
    state = {
        **initial_state,
        "main_questions_asked": 1,
        "current_question": question,
        "turns": [],
    }

    try:
        saved = repository.save_interview(
            interview_id=interview["id"],
            state=state,
            status="in_progress",
            expected_version=interview["version"],
        )
    except repository.ConflictError:
        raise HTTPException(
            status_code=409,
            detail="Interview state changed. Please reload.",
        ) from None
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    # 6. Return the response defined by the existing schema.
    return InterviewResponse(
        id=saved["id"],
        workspace_id=saved["workspace_id"],
        status=saved["status"],
        version=saved["version"],
        main_questions_asked=state["main_questions_asked"],
        follow_ups_asked=state["follow_ups_asked"],
        current_question=InterviewQuestion(**question),
        turns=[],
        feedback=None,
    )



@app.post(
    "/api/interviews/{interview_id}/answers",
    response_model=InterviewResponse,
)


def submit_interview_answer(
    interview_id: UUID,
    request: InterviewAnswerRequest,
):
    """Save an answer and generate the next main question."""

    # 1. Load the interview.
    try:
        interview = repository.get_interview(str(interview_id))
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found.")

    # 2. Validate the interview status and version.
    if interview["status"] != "in_progress":
        raise HTTPException(
            status_code=409,
            detail="This interview is not accepting answers right now. Reload and try again.",
        )

    if interview["version"] != request.expected_version:
        raise HTTPException(
            status_code=409,
            detail="Interview version is outdated. Reload and try again.",
        )

    # 3. Record the answer.
    try:
        updated_state = record_answer(
            state=interview["state"],
            question_id=str(request.question_id),
            answer=request.answer,
        )
    except InterviewStateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    # 4. Save the answer before making the AI request.
    try:
        saved = repository.save_interview(
            interview_id=str(interview_id),
            state=updated_state,
            status="processing",
            expected_version=request.expected_version,
        )
    except repository.ConflictError:
        raise HTTPException(
            status_code=409,
            detail="Interview changed. Reload and try again.",
        ) from None
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    
    # 5. Decide whether to ask a follow-up or a new main question.
    next_question = None
    action = "next_main"

    # Ask the AI for a decision only while follow-ups remain available.
    if updated_state["follow_ups_asked"] < 2:
        try:
            decision = decide_follow_up(
                intake=interview["intake_snapshot"],
                turns=updated_state["turns"],
                follow_ups_asked=updated_state["follow_ups_asked"],
            )
            action = decision["action"]

        except InterviewGenerationError:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Your answer was saved, but the next step "
                    "could not be determined. Please try again later."
                ),
            ) from None

    # 6. Create a follow-up question when the AI recommends one.
    if action == "follow_up":
        next_question = {
            "id": str(uuid4()),
            "text": decision["text"],
            "topic": decision["topic"],
            "kind": "follow_up",
        }

        updated_state["follow_ups_asked"] += 1
        updated_state["current_question"] = next_question

    # 7. Otherwise, generate the next main question if any remain.
    elif updated_state["main_questions_asked"] < updated_state["question_count"]:
        try:
            generated = generate_next_question(
                intake=interview["intake_snapshot"],
                turns=updated_state["turns"],
                next_question_number=updated_state["main_questions_asked"] + 1,
            )
        except InterviewGenerationError:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Your answer was saved, but the next question "
                    "could not be generated. Please try again later."
                ),
            ) from None

        next_question = {
            "id": str(uuid4()),
            "text": generated["text"],
            "topic": generated["topic"],
            "kind": "main",
        }

        updated_state["main_questions_asked"] += 1
        updated_state["current_question"] = next_question

    
    # 8. If another question was generated, save it and continue.
    feedback_data = None

    if next_question is not None:
        try:
            saved = repository.save_interview(
                interview_id=str(interview_id),
                state=updated_state,
                status="in_progress",
                expected_version=saved["version"],
            )
        except repository.ConflictError:
            raise HTTPException(
                status_code=409,
                detail="Interview changed. Reload and try again.",
            ) from None
        except (psycopg.Error, TimeoutError):
            raise HTTPException(
                status_code=503,
                detail="Database unavailable. Please try again.",
            ) from None

    # 9. If there are no more questions, generate final feedback.
    else:
        try:
            feedback_data = generate_interview_feedback(
                intake=interview["intake_snapshot"],
                turns=updated_state["turns"],
                question_count=updated_state["question_count"],
            )
        except InterviewGenerationError:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Your answer was saved, but final feedback "
                    "could not be generated. Please try again later."
                ),
            ) from None

        # Save the completed state and feedback together.
        try:
            saved = repository.save_interview(
                interview_id=str(interview_id),
                state=updated_state,
                status="completed",
                expected_version=saved["version"],
                feedback=feedback_data,
            )
        except repository.ConflictError:
            raise HTTPException(
                status_code=409,
                detail="Interview changed. Reload and try again.",
            ) from None
        except (psycopg.Error, TimeoutError):
            raise HTTPException(
                status_code=503,
                detail="Database unavailable. Please try again.",
            ) from None

    # 10. Return the latest saved interview.
    return InterviewResponse(
        id=saved["id"],
        workspace_id=saved["workspace_id"],
        status=saved["status"],
        version=saved["version"],
        main_questions_asked=updated_state["main_questions_asked"],
        follow_ups_asked=updated_state["follow_ups_asked"],
        current_question=(
            InterviewQuestion(**next_question)
            if next_question is not None
            else None
        ),
        turns=[
            InterviewTurn(
                question=InterviewQuestion(**turn["question"]),
                answer=turn["answer"],
            )
            for turn in updated_state["turns"]
        ],
        feedback=(
            InterviewFeedback(**feedback_data)
            if feedback_data is not None
            else None
        ),
    ) 



@app.post(
    "/api/interviews/{interview_id}/finish",
    response_model=InterviewResponse,
)

def finish_interview(interview_id: UUID):
    """Finish an interview early and generate feedback."""

    # 1. Load the saved interview.
    try:
        interview = repository.get_interview(str(interview_id))
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    if interview is None:
        raise HTTPException(
            status_code=404,
            detail="Interview not found.",
        )

    # 2. Return existing results if already completed.
    if interview["status"] == "completed":
        state = interview["state"]

        return InterviewResponse(
            id=interview["id"],
            workspace_id=interview["workspace_id"],
            status=interview["status"],
            version=interview["version"],
            main_questions_asked=state["main_questions_asked"],
            follow_ups_asked=state["follow_ups_asked"],
            current_question=None,
            turns=[
                InterviewTurn(
                    question=InterviewQuestion(**turn["question"]),
                    answer=turn["answer"],
                )
                for turn in state["turns"]
            ],
            feedback=(
                InterviewFeedback.model_validate(interview["feedback"])
                if interview["feedback"] is not None
                else None
            ),
        )

    # 3. Only active interviews can be finished.
    if interview["status"] != "in_progress":
        raise HTTPException(
            status_code=409,
            detail="Interview is not ready to finish. Reload progress.",
        )

    state = interview["state"]
    turns = state["turns"]

    # 4. At least one answer is needed for meaningful feedback.
    if not turns:
        raise HTTPException(
            status_code=400,
            detail="Answer at least one question before finishing.",
        )

    # 5. Generate feedback using the existing AI service.
    try:
        feedback_data = generate_interview_feedback(
            intake=interview["intake_snapshot"],
            turns=turns,
            question_count=state["question_count"],
        )
    except InterviewGenerationError:
        raise HTTPException(
            status_code=503,
            detail="Could not generate feedback. Please try again.",
        ) from None

    # 6. Early-finish feedback must be marked incomplete.
    feedback_data = InterviewFeedback.model_validate(
        feedback_data
    ).model_dump(mode="json")

    feedback_data["incomplete"] = True

    # 7. Clear the pending question.
    updated_state = {
        **state,
        "current_question": None,
    }

    # 8. Save the completed interview and feedback.
    try:
        saved = repository.save_interview(
            interview_id=str(interview_id),
            state=updated_state,
            status="completed",
            expected_version=interview["version"],
            feedback=feedback_data,
        )
    except repository.ConflictError:
        raise HTTPException(
            status_code=409,
            detail="Interview changed. Reload progress and try again.",
        ) from None
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    # 9. Return the final interview result.
    return InterviewResponse(
        id=saved["id"],
        workspace_id=saved["workspace_id"],
        status=saved["status"],
        version=saved["version"],
        main_questions_asked=updated_state["main_questions_asked"],
        follow_ups_asked=updated_state["follow_ups_asked"],
        current_question=None,
        turns=[
            InterviewTurn(
                question=InterviewQuestion(**turn["question"]),
                answer=turn["answer"],
            )
            for turn in updated_state["turns"]
        ],
        feedback=InterviewFeedback.model_validate(feedback_data),
    )


@app.get(
    "/api/interviews/{interview_id}",
    response_model=InterviewResponse,
)
def load_interview(interview_id: UUID):
    """Load a saved interview and its current progress."""

    # 1. Retrieve the interview from the database.
    try:
        interview = repository.get_interview(str(interview_id))
    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            status_code=503,
            detail="Database unavailable. Please try again.",
        ) from None

    # 2. Check that the interview exists.
    if interview is None:
        raise HTTPException(
            status_code=404,
            detail="Interview not found.",
        )

    # 3. Read the saved interview state.
    state = interview["state"]
    current_question = state.get("current_question")
    feedback_data = interview.get("feedback")

    # 4. Return the data in the existing response format.
    return InterviewResponse(
        id=interview["id"],
        workspace_id=interview["workspace_id"],
        status=interview["status"],
        version=interview["version"],
        main_questions_asked=state["main_questions_asked"],
        follow_ups_asked=state["follow_ups_asked"],
        current_question=(
            InterviewQuestion(**current_question)
            if current_question is not None
            else None
        ),
        turns=[
            InterviewTurn(
                question=InterviewQuestion(**turn["question"]),
                answer=turn["answer"],
            )
            for turn in state.get("turns", [])
        ],
        feedback=(
            InterviewFeedback.model_validate(feedback_data)
            if feedback_data is not None
            else None
        ),
    )

 

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


def build_job_fit_response(
    artifact: dict,
    current_intake_version: int,
) -> JobFitLookupResponse:
    stale = (
        artifact["intake_version"] != current_intake_version
    )

    return JobFitLookupResponse(
        found=True,
        stale=stale,
        detail=(
            "Your preparation details changed. Generate a new analysis."
            if stale
            else "Job-fit analysis is ready."
        ),
        artifact_id=artifact["id"],
        intake_version=artifact["intake_version"],
        created_at=artifact["created_at"],
        result=JobFitResult.model_validate(artifact["output"]),
    )

@app.post(
    "/api/workspaces/{workspace_id}/fit",
    response_model=JobFitLookupResponse,
)
def create_job_fit(workspace_id: UUID):
    try:
        workspace = repository.get_workspace(str(workspace_id))

        if workspace is None:
            raise HTTPException(404, "Workspace not found.")

        intake = IntakeData.model_validate(workspace["intake"])

        if (
            not (intake.cv_text or "").strip()
            or not (intake.job_description or "").strip()
        ):
            raise HTTPException(
                422,
                "Add and confirm a CV and job description "
                "before requesting job-fit analysis.",
            )

        intake_version = workspace["intake_version"]

        existing = repository.get_latest_artifact(
            workspace_id=str(workspace_id),
            kind="fit",
            intake_version=intake_version,
        )

        if existing is not None:
            return build_job_fit_response(
                existing,
                intake_version,
            )

        # No database connection is held during the AI call.
        result, metadata = generate_job_fit(
            intake.model_dump(mode="json")
        )

        # Check whether the details changed during generation.
        current = repository.get_workspace(str(workspace_id))

        if current is None:
            raise HTTPException(404, "Workspace no longer exists.")

        if current["intake_version"] != intake_version:
            raise HTTPException(
                409,
                "Your preparation details changed during analysis. "
                "Please run it again.",
            )

        artifact = repository.save_artifact(
            workspace_id=str(workspace_id),
            kind="fit",
            output=result.model_dump(mode="json"),
            intake_version=intake_version,
            meta=metadata,
        )

        # Recheck so a concurrent intake edit marks the result stale.
        latest = repository.get_workspace(str(workspace_id))

        if latest is None:
            raise HTTPException(404, "Workspace no longer exists.")

        return build_job_fit_response(
            artifact,
            latest["intake_version"],
        )

    except JobFitInputError as exc:
        raise HTTPException(422, str(exc)) from None

    except APITimeoutError:
        raise HTTPException(
            504,
            "Job-fit analysis timed out. Please retry.",
        ) from None

    except AuthenticationError:
        raise HTTPException(
            503,
            "The AI service credentials need configuration.",
        ) from None

    except RateLimitError:
        raise HTTPException(
            503,
            "The AI service limit was reached. Please try later.",
        ) from None

    except APIError:
        raise HTTPException(
            502,
            "The AI request failed. Check the configured model and service.",
        ) from None

    except (JobFitGenerationError, ValidationError):
        raise HTTPException(
            502,
            "A valid job-fit analysis could not be produced. Please retry.",
        ) from None

    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503,
            "The database operation failed. "
            "The analysis may not be saved.",
        ) from None

    except RuntimeError:
        raise HTTPException(
            503,
            "Job-fit analysis is not configured on the backend.",
        ) from None


@app.get(
    "/api/workspaces/{workspace_id}/fit",
    response_model=JobFitLookupResponse,
)
def load_job_fit(workspace_id: UUID):
    try:
        workspace = repository.get_workspace(str(workspace_id))

        if workspace is None:
            raise HTTPException(404, "Workspace not found.")

        artifact = repository.get_latest_artifact(
            workspace_id=str(workspace_id),
            kind="fit",
            intake_version=workspace["intake_version"],
        )

        if artifact is None:
            return JobFitLookupResponse(
                found=False,
                stale=False,
                detail=(
                    "No saved job-fit analysis for the current details."
                ),
            )

        return build_job_fit_response(
            artifact,
            workspace["intake_version"],
        )

    except ValidationError:
        raise HTTPException(
            502,
            "The saved analysis could not be loaded. "
            "Its format is invalid.",
        ) from None

    except (psycopg.Error, TimeoutError):
        raise HTTPException(
            503,
            "Database unavailable. Please try again.",
        ) from None

def roadmap_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, RoadmapNotFoundError):
        return HTTPException(404, str(exc))

    if isinstance(exc, RoadmapInputError):
        return HTTPException(422, str(exc))

    if isinstance(exc, RoadmapChangedError):
        return HTTPException(409, str(exc))

    if isinstance(exc, APITimeoutError):
        return HTTPException(504, "Plan generation timed out. Please retry.")

    if isinstance(exc, AuthenticationError):
        return HTTPException(503, "The AI service credentials need configuration.")

    if isinstance(exc, RateLimitError):
        return HTTPException(503, "AI usage limit reached. Please try later.")

    if isinstance(exc, APIError):
        return HTTPException(502, "The AI request failed. Please retry.")

    if isinstance(exc, (RoadmapGenerationError, ValidationError)):
        return HTTPException(502, "A valid learning plan could not be produced.")

    if isinstance(exc, (psycopg.Error, TimeoutError)):
        return HTTPException(
            503,
            "Database unavailable. The plan may not have been saved.",
        )

    return HTTPException(503, "Learning-plan generation is not configured.")


@app.post(
    "/api/workspaces/{workspace_id}/roadmap",
    response_model=RoadmapLookupResponse,
)
def create_roadmap(workspace_id: UUID, request: RoadmapRequest):
    try:
        return create_saved_roadmap(str(workspace_id), request)
    except (
        RoadmapNotFoundError,
        RoadmapInputError,
        RoadmapChangedError,
        RoadmapGenerationError,
        ValidationError,
        APIError,
        psycopg.Error,
        TimeoutError,
        RuntimeError,
    ) as exc:
        raise roadmap_http_error(exc) from None


@app.get(
    "/api/workspaces/{workspace_id}/roadmap",
    response_model=RoadmapLookupResponse,
)
def load_roadmap(workspace_id: UUID):
    try:
        return load_saved_roadmap(str(workspace_id))
    except (
        RoadmapNotFoundError,
        ValidationError,
        psycopg.Error,
        TimeoutError,
    ) as exc:
        raise roadmap_http_error(exc) from None

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

