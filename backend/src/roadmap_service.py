import hashlib
import json
import os
from uuid import uuid4

from dotenv import load_dotenv
from openai import OpenAI

from src import repository
from src.prompts import ROADMAP_PROMPT
from src.schemas import (
    LearningRoadmap,
    RoadmapContent,
    RoadmapLookupResponse,
    RoadmapRequest,
    RoadmapResponse,
)

load_dotenv()

PROMPT_VERSION = "roadmap-v1"


class RoadmapInputError(ValueError):
    pass


class RoadmapGenerationError(Exception):
    pass


class RoadmapChangedError(Exception):
    pass


class RoadmapNotFoundError(Exception):
    pass


def load_context(workspace_id: str) -> dict:
    workspace = repository.get_workspace(workspace_id)

    if workspace is None:
        raise RoadmapNotFoundError("Preparation not found.")

    version = workspace["intake_version"]
    intake = workspace["intake"]

    evidence = {}
    identities = {}

    for key in ("cv_text", "job_description"):
        text = (intake.get(key) or "").strip()
        if text:
            evidence["cv" if key == "cv_text" else key] = text

    for kind in ("review", "fit"):
        artifact = repository.get_latest_artifact(
            workspace_id=workspace_id,
            kind=kind,
            intake_version=version,
        )
        if artifact:
            evidence[kind] = artifact["output"]
            identities[kind] = str(artifact["id"])

    interview = repository.get_latest_completed_interview(
        workspace_id,
        version,
    )

    if interview:
        evidence["interview"] = {
            "feedback": interview["feedback"],
            "turns": interview["state"].get("turns", []),
        }
        identities["interview"] = {
            "id": str(interview["id"]),
            "version": interview["version"],
        }

    return {
        "workspace_id": workspace_id,
        "intake_version": version,
        "target_role": intake.get("target_role", ""),
        "company": intake.get("company", ""),
        "evidence": evidence,
        "source_ids": identities,
    }


def fingerprint(context: dict, hours: int, weeks: int) -> str:
    # Intake text changes must increment intake_version.
    identity = {
        "workspace_id": context["workspace_id"],
        "intake_version": context["intake_version"],
        "source_ids": context["source_ids"],
        "hours_per_week": hours,
        "duration_weeks": weeks,
        "prompt_version": PROMPT_VERSION,
    }
    encoded = json.dumps(
        identity,
        sort_keys=True,
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_lookup(artifact: dict | None, context: dict):
    if artifact is None:
        return RoadmapLookupResponse(
            found=False,
            stale=False,
            message="No saved learning plan for these preparation details.",
        )

    plan = LearningRoadmap.model_validate(artifact["output"])
    current_key = fingerprint(
        context,
        plan.hours_per_week,
        plan.duration_weeks,
    )
    stale = artifact.get("meta", {}).get("input_key") != current_key

    return RoadmapLookupResponse(
        found=True,
        stale=stale,
        message=(
            "New preparation results are available. You can update this plan."
            if stale
            else "Your saved learning plan is ready."
        ),
        result=RoadmapResponse(
            id=artifact["id"],
            workspace_id=artifact["workspace_id"],
            intake_version=artifact["intake_version"],
            created_at=artifact["created_at"],
            plan=plan,
        ),
    )


def load_saved_roadmap(workspace_id: str):
    context = load_context(workspace_id)
    artifact = repository.get_latest_artifact(
        workspace_id=workspace_id,
        kind="roadmap",
        intake_version=context["intake_version"],
    )
    return build_lookup(artifact, context)


def validate_content(
    content: RoadmapContent,
    context: dict,
    request: RoadmapRequest,
):
    if not content.title.strip() or not content.summary.strip():
        raise RoadmapGenerationError("Missing plan title or summary.")

    available = set(context["evidence"])

    for week in range(1, request.duration_weeks + 1):
        activities = [
            item for item in content.activities if item.week == week
        ]

        if not 2 <= len(activities) <= 3:
            raise RoadmapGenerationError(
                "Each week must contain two or three activities."
            )

        if sum(item.minutes for item in activities) > (
            request.hours_per_week * 60
        ):
            raise RoadmapGenerationError("Weekly workload exceeds budget.")

    for item in content.activities:
        if not 1 <= item.week <= request.duration_weeks:
            raise RoadmapGenerationError("Invalid activity week.")

        if not 5 <= item.minutes <= 60:
            raise RoadmapGenerationError("Invalid activity duration.")

        if not 2 <= len(item.instructions) <= 4:
            raise RoadmapGenerationError("Invalid activity instructions.")

        if not 2 <= len(item.checklist) <= 3 or len(item.fields) > 4:
            raise RoadmapGenerationError("Invalid activity controls.")

        if (
            not item.source_refs
            or not set(item.source_refs).issubset(available)
        ):
            raise RoadmapGenerationError("Invalid evidence reference.")

        text_values = [
            item.title,
            item.purpose,
            item.reason,
            *item.instructions,
            *item.checklist,
            *(field.label for field in item.fields),
        ]
        if any(not value.strip() for value in text_values):
            raise RoadmapGenerationError("Empty activity content.")


def create_saved_roadmap(
    workspace_id: str,
    request: RoadmapRequest,
):
    context = load_context(workspace_id)

    if context["intake_version"] != request.expected_intake_version:
        raise RoadmapChangedError(
            "Your preparation changed. Reopen it before creating a plan."
        )

    role = context["target_role"].strip()
    if not role or role.casefold() == "string":
        raise RoadmapInputError("Add a meaningful target role first.")

    if not context["evidence"]:
        raise RoadmapInputError(
            "Add a CV, complete an interview, or generate job-fit feedback first."
        )

    input_key = fingerprint(
        context,
        request.hours_per_week,
        request.duration_weeks,
    )

    existing = repository.get_latest_artifact(
        workspace_id=workspace_id,
        kind="roadmap",
        intake_version=context["intake_version"],
    )

    if existing and existing.get("meta", {}).get("input_key") == input_key:
        return build_lookup(existing, context)

    model = os.getenv("OPENAI_MODEL")
    if not model:
        raise RuntimeError("OPENAI_MODEL is not configured.")

    client = OpenAI(timeout=90.0, max_retries=1)

    response = client.responses.parse(
        model=model,
        instructions=ROADMAP_PROMPT,
        input=[
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "target_role": role,
                        "company": context["company"],
                        "hours_per_week": request.hours_per_week,
                        "duration_weeks": request.duration_weeks,
                        "evidence": context["evidence"],
                    },
                    ensure_ascii=False,
                ),
            }
        ],
        text_format=RoadmapContent,
        max_output_tokens=10000,
        store=False,
    )

    content = response.output_parsed
    if content is None:
        raise RoadmapGenerationError("No complete plan was returned.")

    validate_content(content, context, request)

    content.activities.sort(key=lambda activity: activity.week)
    for activity in content.activities:
        activity.id = str(uuid4())

    labels = {
        "cv": "Your CV",
        "job_description": "Job description",
        "review": "CV review",
        "fit": "Job-fit analysis",
        "interview": "Completed interview",
    }

    plan = LearningRoadmap(
        **content.model_dump(),
        hours_per_week=request.hours_per_week,
        duration_weeks=request.duration_weeks,
        based_on=[labels[key] for key in context["evidence"]],
    )

    # Do not save against evidence that changed during generation.
    current = load_context(workspace_id)
    if fingerprint(
        current,
        request.hours_per_week,
        request.duration_weeks,
    ) != input_key:
        raise RoadmapChangedError(
            "Your preparation results changed during generation. Please retry."
        )

    artifact = repository.save_artifact(
        workspace_id=workspace_id,
        kind="roadmap",
        intake_version=context["intake_version"],
        output=plan.model_dump(mode="json"),
        meta={
            "input_key": input_key,
            "source_ids": context["source_ids"],
            "prompt_version": PROMPT_VERSION,
            "model": model,
            "usage": (
                response.usage.model_dump(mode="json")
                if response.usage
                else {}
            ),
        },
    )

    # Detect changes occurring immediately around the save.
    return build_lookup(artifact, load_context(workspace_id))