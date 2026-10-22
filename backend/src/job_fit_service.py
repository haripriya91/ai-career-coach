import json
import os
import re

from dotenv import load_dotenv
from openai import OpenAI

from src.prompts import JOB_FIT_PROMPT
from src.schemas import JobFitAssessment, JobFitResult

load_dotenv()


class JobFitInputError(ValueError):
    """The supplied CV or job description cannot be analysed."""


class JobFitGenerationError(Exception):
    """The AI response is incomplete or fails validation."""


def normalise(text: str) -> str:
    """Ignore whitespace and case when checking quotations."""
    return re.sub(r"\s+", " ", text).strip().casefold()


def validate_assessment(
    assessment: JobFitAssessment,
    cv_text: str,
    job_description: str,
) -> None:
    if not assessment.requirements:
        raise JobFitInputError(
            "No assessable requirements were found. "
            "Please provide a complete job description."
        )

    if len(assessment.requirements) > 40:
        raise JobFitGenerationError(
            "Too many requirements were returned."
        )

    improvements = assessment.priority_improvements

    if len(improvements) != 3 or any(
        not item.strip() for item in improvements
    ):
        raise JobFitGenerationError(
            "Expected three non-empty priority improvements."
        )

    cv = normalise(cv_text)
    job = normalise(job_description)
    seen = set()

    for item in assessment.requirements:
        requirement_key = normalise(item.requirement)

        if not requirement_key or requirement_key in seen:
            raise JobFitGenerationError(
                "Empty or duplicate requirement returned."
            )

        seen.add(requirement_key)

        if not item.explanation.strip():
            raise JobFitGenerationError(
                "A requirement is missing its explanation."
            )

        if not item.suggested_action.strip():
            raise JobFitGenerationError(
                "A requirement is missing its suggested action."
            )

        job_quote = normalise(item.job_evidence)

        if not job_quote or job_quote not in job:
            raise JobFitGenerationError(
                "A job evidence quotation could not be verified."
            )

        if item.status == "not_evidenced":
            if item.cv_evidence is not None:
                raise JobFitGenerationError(
                    "A not-evidenced finding included CV evidence."
                )
        else:
            cv_quote = normalise(item.cv_evidence or "")

            if not cv_quote or cv_quote not in cv:
                raise JobFitGenerationError(
                    "A CV evidence quotation could not be verified."
                )


def calculate_coverage(
    assessment: JobFitAssessment,
) -> float:
    importance_weights = {
        "required": 2,
        "preferred": 1,
    }

    status_values = {
        "matched": 1.0,
        "partial": 0.5,
        "not_evidenced": 0.0,
    }

    total_weight = 0
    covered_weight = 0.0

    for requirement in assessment.requirements:
        weight = importance_weights[requirement.importance]
        total_weight += weight
        covered_weight += (
            weight * status_values[requirement.status]
        )

    if total_weight == 0:
        raise JobFitGenerationError(
            "No requirements are available for scoring."
        )

    return round(
        covered_weight / total_weight * 100,
        1,
    )


def generate_job_fit(
    intake: dict,
) -> tuple[JobFitResult, dict]:
    cv_text = (intake.get("cv_text") or "").strip()
    job_description = (
        intake.get("job_description") or ""
    ).strip()

    if not cv_text or not job_description:
        raise JobFitInputError(
            "A CV and job description are required."
        )

    if len(cv_text) > 60_000:
        raise JobFitInputError(
            "The CV exceeds the 60,000-character limit."
        )

    if len(job_description) > 30_000:
        raise JobFitInputError(
            "The job description exceeds the "
            "30,000-character limit."
        )

    model = os.getenv("OPENAI_MODEL")

    if not model:
        raise RuntimeError(
            "OPENAI_MODEL is not configured."
        )

    input_data = json.dumps(
        {
            "target_role": intake.get("target_role", ""),
            "company": intake.get("company", ""),
            "cv_text": cv_text,
            "job_description": job_description,
        },
        ensure_ascii=False,
    )

    instructions = JOB_FIT_PROMPT

    with OpenAI(timeout=90.0, max_retries=1) as client:
        # Retry generation once if the assessment fails validation.
        for attempt in range(2):
            response = client.responses.parse(
                model=model,
                instructions=instructions,
                input=[
                    {
                        "role": "user",
                        "content": input_data,
                    }
                ],
                text_format=JobFitAssessment,
                max_output_tokens=6000,
                store=False,
            )

            assessment = response.output_parsed

            try:
                if assessment is None:
                    raise JobFitGenerationError(
                        "The AI did not return a complete assessment."
                    )

                validate_assessment(
                    assessment,
                    cv_text,
                    job_description,
                )

            except JobFitGenerationError as exc:
                # The second failed attempt returns the existing error.
                if attempt == 1:
                    raise

                instructions = (
                    JOB_FIT_PROMPT
                    + "\n\nThe previous attempt failed validation: "
                    + str(exc)
                    + "\nGenerate a fresh assessment. Check every "
                    "evidence excerpt against the supplied source "
                    "text. Copy short, continuous excerpts exactly "
                    "without rewriting them."
                )

            else:
                # Validation passed: no further AI request is needed.
                break

    result = JobFitResult(
        **assessment.model_dump(),
        coverage_score=calculate_coverage(assessment),
    )

    metadata = {
        "model": model,
        "prompt_version": "job-fit-v2",
        "scoring_version": "required-2-preferred-1-v1",
        "generation_attempts": attempt + 1,
        "usage": (
            response.usage.model_dump(mode="json")
            if response.usage
            else {}
        ),
    }

    return result, metadata