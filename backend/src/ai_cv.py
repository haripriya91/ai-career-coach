import json
import os
from pathlib import Path
from time import perf_counter

from dotenv import load_dotenv
from openai import OpenAI

from src.prompts import CV_REVIEW_PROMPT
from src.schemas import CVReview, IntakeData


load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class ReviewGenerationError(Exception):
    pass


def generate_cv_review(intake: IntakeData) -> tuple[CVReview, dict]:
    api_key = os.getenv("OPENAI_API_KEY")
    model = os.getenv("OPENAI_MODEL")

    if not api_key or not model:
        raise RuntimeError(
            "Set OPENAI_API_KEY and OPENAI_MODEL in backend/.env."
        )

    started = perf_counter()

    # No automatic retries: keep latency and duplicate API costs bounded.
    with OpenAI(
        api_key=api_key,
        timeout=60.0,
        max_retries=0,
    ) as client:
        response = client.responses.parse(
            model=model,
            instructions=CV_REVIEW_PROMPT,
            input=json.dumps(
                intake.model_dump(mode="json"),
                ensure_ascii=False,
            ),
            text_format=CVReview,
            store=False,
        )

    review = response.output_parsed

    if response.status != "completed" or review is None:
        raise ReviewGenerationError(
            "The model did not return a complete review. Please retry."
        )

    # An evidence quote must actually exist in the supplied CV.
    def normalize(text: str) -> str:
        return " ".join(text.split())

    cv_text = normalize(intake.cv_text)

    for finding in review.findings:
        if finding.evidence_excerpt is not None:
            excerpt = normalize(finding.evidence_excerpt)

            if not excerpt or excerpt not in cv_text:
                raise ReviewGenerationError(
                    "The review contained an unsupported CV quote. "
                    "Please retry."
                )

    usage = response.usage

    metadata = {
        "model": response.model,
        "prompt_version": "cv-review-v1",
        "input_tokens": usage.input_tokens if usage else None,
        "output_tokens": usage.output_tokens if usage else None,
        "duration_ms": round((perf_counter() - started) * 1000),
    }

    return review, metadata