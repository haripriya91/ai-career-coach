from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, computed_field


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

class CVReviewResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    intake_version: int
    review: CVReview
    created_at: datetime

class CVReviewLookupResponse(BaseModel):
    found: bool
    message: str
    result: CVReviewResponse | None


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
    question_count: int
    main_questions_asked: int
    follow_ups_asked: int

    current_question: InterviewQuestion | None
    turns: list[InterviewTurn]
    feedback: InterviewFeedback | None

    @computed_field
    @property
    def is_completed(self) -> bool:
        return self.status == "completed"


# ---------- Workspace update ----------

class WorkspaceUpdateRequest(BaseModel):
    intake: IntakeData
    expected_version: int = Field(ge=1)


#-------------job fit -------------------

class RequirementAssessment(BaseModel):
    requirement: str
    importance: Literal["required", "preferred"]
    status: Literal["matched", "partial", "not_evidenced"]

    # Exact excerpts from the supplied documents.
    job_evidence: str
    cv_evidence: str | None

    explanation: str
    suggested_action: str


class JobFitAssessment(BaseModel):
    summary: str
    requirements: list[RequirementAssessment]
    priority_improvements: list[str]


class JobFitResult(JobFitAssessment):
    coverage_score: float = Field(ge=0, le=100)


class JobFitLookupResponse(BaseModel):
    found: bool
    stale: bool
    detail: str
    artifact_id: UUID | None = None
    intake_version: int | None = None
    created_at: datetime | None = None
    result: JobFitResult | None = None 


# ---------- Learning roadmap ----------

class RoadmapRequest(BaseModel):
    hours_per_week: int = Field(default=3, ge=1, le=10)
    duration_weeks: int = Field(default=2, ge=1, le=4)
    expected_intake_version: int = Field(ge=1)


class LearningField(BaseModel):
    label: str
    placeholder: str


class LearningActivity(BaseModel):
    # Assigned by the backend after generation.
    id: str
    week: int
    category: Literal[
        "skill_practice",
        "interview_practice",
        "cv_evidence",
    ]
    title: str
    purpose: str
    reason: str
    minutes: int
    instructions: list[str]
    fields: list[LearningField]
    hint: str | None
    example: str | None
    checklist: list[str]
    source_refs: list[
        Literal["cv", "job_description", "review", "fit", "interview"]
    ]


class RoadmapContent(BaseModel):
    """Structured content requested from the AI."""

    title: str
    summary: str
    activities: list[LearningActivity]


class LearningRoadmap(RoadmapContent):
    hours_per_week: int
    duration_weeks: int
    based_on: list[str]


class RoadmapResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    intake_version: int
    created_at: datetime
    plan: LearningRoadmap


class RoadmapLookupResponse(BaseModel):
    found: bool
    stale: bool
    message: str
    result: RoadmapResponse | None = None

# ---------- Company-specific interview preparation ----------

class CompanySource(BaseModel):
    title: str
    url: str


class CompanyInterviewQuestion(BaseModel):
    category: Literal[
        "technical",
        "behavioral",
        "role_specific",
        "company_specific",
    ]
    question: str
    preparation_tip: str


class CompanyPrepResult(BaseModel):
    company_name: str
    target_role: str
    company_overview: str
    company_values: list[str]
    company_culture: list[str]
    interview_process: list[str]
    key_skills: list[str]
    likely_interview_topics: list[str]
    practice_questions: list[CompanyInterviewQuestion]
    preparation_tips: list[str]
    sources: list[CompanySource]
    limitations: list[str]


class CompanyPrepResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    intake_version: int
    result: CompanyPrepResult
    created_at: datetime


class CompanyPrepLookupResponse(BaseModel):
    found: bool
    stale: bool
    detail: str
    result: CompanyPrepResponse | None = None
