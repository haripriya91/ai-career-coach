from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# ---------- File extraction ----------


class ExtractionResponse(BaseModel):
    filename: str
    extracted_text: str
    warnings: list[str] = Field(default_factory=list)


# ---------- Confirmed intake / workspace ----------


class IntakeData(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    target_role: str = Field(min_length=1, max_length=150)
    company: str = Field(default="", max_length=150)
    cv_text: str = Field(default="", max_length=40000)
    job_description: str = Field(default="", max_length=20000)


class WorkspaceResponse(BaseModel):
    id: UUID
    intake: IntakeData
    intake_version: int
    created_at: datetime
    updated_at: datetime


# ---------- CV review ----------


class CVFinding(BaseModel):
    category: Literal[
        "content",
        "clarity",
        "language",
        "relevance",
        "skills",
        "structure",
    ]
    priority: Literal["high", "medium", "low"]

    observation: str
    evidence_excerpt: str | None
    suggested_action: str
    suggested_rewrite: str | None
    needs_confirmation: bool


class CVReview(BaseModel):
    summary: str
    strengths: list[str]
    findings: list[CVFinding]
    next_steps: list[str]
    limitations: list[str]


# ---------- Interview requests ----------


class InterviewStartRequest(BaseModel):
    workspace_id: UUID
    question_count: int = Field(default=5, ge=1, le=5)


class InterviewAnswerRequest(BaseModel):
    question_id: UUID
    answer: str = Field(min_length=1, max_length=10000)
    expected_version: int = Field(ge=1)


# ---------- Interview outputs ----------


class InterviewQuestion(BaseModel):
    id: UUID
    text: str
    topic: str
    kind: Literal["main", "follow_up"]


class InterviewTurn(BaseModel):
    question: InterviewQuestion
    answer: str


class FeedbackDimension(BaseModel):
    name: Literal[
        "relevance",
        "specificity",
        "clarity",
        "role_reasoning",
    ]
    score: int | None = Field(ge=0, le=4)
    reason: str
    answer_excerpt: str | None
    improvement: str


class InterviewFeedback(BaseModel):
    summary: str
    dimensions: list[FeedbackDimension]
    overall_score: float | None = Field(ge=0, le=100)
    strengths: list[str]
    improvements: list[str]
    incomplete: bool


class InterviewResponse(BaseModel):
    id: UUID
    workspace_id: UUID

    status: Literal[
        "not_started",
        "in_progress",
        "processing",
        "completed",
    ]

    version: int
    main_questions_asked: int
    follow_ups_asked: int

    current_question: InterviewQuestion | None
    turns: list[InterviewTurn]
    feedback: InterviewFeedback | None