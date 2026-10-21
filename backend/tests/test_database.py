import os

import pytest

from src import repository as db


pytestmark = pytest.mark.skipif(
    not os.getenv("DATABASE_URL"),
    reason="DATABASE_URL is not configured",
)


@pytest.fixture
def workspace():
    """Create fictional data and remove it after each test."""
    created = db.create_workspace({
        "target_role": "Frontend Developer",
        "company": "",
        "cv_text": "FICTIONAL CV: React and TypeScript experience.",
        "job_description": "",
    })

    try:
        yield created
    finally:
        db.delete_workspace(created["id"])


def test_workspace_roundtrip(workspace):
    loaded = db.get_workspace(workspace["id"])

    assert loaded is not None
    assert loaded["intake"]["target_role"] == "Frontend Developer"
    assert loaded["intake_version"] == 1

    intake = {
        **loaded["intake"],
        "target_role": "Full-stack Developer",
    }

    updated = db.update_intake(
        workspace["id"],
        intake,
        expected_version=loaded["intake_version"],
    )

    assert updated["intake_version"] == 2
    assert updated["intake"]["target_role"] == "Full-stack Developer"
    assert updated["intake"]["cv_text"] == loaded["intake"]["cv_text"]


def test_stale_intake_update_is_rejected(workspace):
    db.update_intake(
        workspace["id"],
        workspace["intake"],
        expected_version=1,
    )

    with pytest.raises(db.ConflictError):
        db.update_intake(
            workspace["id"],
            workspace["intake"],
            expected_version=1,
        )


def test_interview_preserves_starting_intake(workspace):
    interview = db.create_interview(
        workspace["id"],
        {
            "turns": [],
            "current_question_id": None,
        },
    )

    changed_intake = {
        **workspace["intake"],
        "target_role": "Backend Developer",
    }

    db.update_intake(
        workspace["id"],
        changed_intake,
        expected_version=1,
    )

    loaded = db.get_interview(interview["id"])

    assert loaded is not None
    assert loaded["intake_version"] == 1
    assert (
        loaded["intake_snapshot"]["target_role"]
        == "Frontend Developer"
    )

    latest = db.get_latest_interview(workspace["id"])

    assert latest is not None
    assert latest["id"] == interview["id"]


def test_interview_save_and_stale_update(workspace):
    interview = db.create_interview(
        workspace["id"],
        {"turns": []},
    )

    saved = db.save_interview(
        interview_id=interview["id"],
        state={
            "turns": [
                {
                    "question_id": "q1",
                    "question": "Tell me about a project.",
                    "answer": "I built a fictional booking dashboard.",
                }
            ]
        },
        status="in_progress",
        expected_version=interview["version"],
    )

    assert saved["version"] == 2
    assert saved["status"] == "in_progress"

    loaded = db.get_interview(interview["id"])

    assert loaded is not None
    assert loaded["state"]["turns"][0]["question_id"] == "q1"

    with pytest.raises(db.ConflictError):
        db.save_interview(
            interview_id=interview["id"],
            state={"turns": []},
            status="in_progress",
            expected_version=1,
        )


def test_artifacts_are_loaded_for_correct_intake(workspace):
    db.save_artifact(
        workspace["id"],
        "review",
        {"summary": "First review"},
        intake_version=1,
    )

    second = db.save_artifact(
        workspace["id"],
        "review",
        {"summary": "Second review"},
        intake_version=1,
    )

    latest = db.get_latest_artifact(
        workspace["id"],
        "review",
        intake_version=1,
    )

    assert latest is not None
    assert latest["id"] == second["id"]

    db.update_intake(
        workspace["id"],
        workspace["intake"],
        expected_version=1,
    )

    # Old results must not appear as results for the new intake.
    assert db.get_latest_artifact(
        workspace["id"],
        "review",
        intake_version=2,
    ) is None

    # The result remains available under its original intake version.
    assert db.get_latest_artifact(
        workspace["id"],
        "review",
        intake_version=1,
    ) is not None


def test_delete_cascades(workspace):
    interview = db.create_interview(
        workspace["id"],
        {"turns": []},
    )

    db.save_artifact(
        workspace["id"],
        "review",
        {"summary": "Fictional review"},
        intake_version=1,
    )

    assert db.delete_workspace(workspace["id"]) is True
    assert db.get_workspace(workspace["id"]) is None
    assert db.get_interview(interview["id"]) is None

    assert db.get_latest_artifact(
        workspace["id"],
        "review",
        intake_version=1,
    ) is None