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



