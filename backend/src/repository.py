from uuid import UUID

from psycopg.types.json import Jsonb

from src.database import get_connection


class ConflictError(Exception):
    """The record changed or was deleted since it was loaded."""


def _clean(row):
    if row is None:
        return None

    return {
        key: str(value) if isinstance(value, UUID) else value
        for key, value in row.items()
    }


# ---------- Workspaces ----------


def create_workspace(intake: dict) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO workspaces (intake)
            VALUES (%s)
            RETURNING *
            """,
            (Jsonb(intake),),
        ).fetchone()

    return _clean(row)


def get_workspace(workspace_id: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM workspaces
            WHERE id = %s
            """,
            (UUID(workspace_id),),
        ).fetchone()

    return _clean(row)


def update_intake(
    workspace_id: str,
    intake: dict,
    expected_version: int,
) -> dict:
    """Replace the complete intake if its version is current."""
    with get_connection() as connection:
        row = connection.execute(
            """
            UPDATE workspaces
            SET intake = %s,
                intake_version = intake_version + 1,
                updated_at = NOW()
            WHERE id = %s
              AND intake_version = %s
            RETURNING *
            """,
            (
                Jsonb(intake),
                UUID(workspace_id),
                expected_version,
            ),
        ).fetchone()

    if row is None:
        raise ConflictError(
            "Workspace changed or was deleted. Reload before saving."
        )

    return _clean(row)


def delete_workspace(workspace_id: str) -> bool:
    with get_connection() as connection:
        result = connection.execute(
            """
            DELETE FROM workspaces
            WHERE id = %s
            """,
            (UUID(workspace_id),),
        )

        deleted = result.rowcount == 1

    return deleted


# ---------- Interviews ----------


def create_interview(
    workspace_id: str,
    state: dict,
) -> dict:
    """Save the intake snapshot used to start this interview."""
    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO interviews (
                workspace_id,
                intake_version,
                intake_snapshot,
                state
            )
            SELECT id, intake_version, intake, %s
            FROM workspaces
            WHERE id = %s
            RETURNING *
            """,
            (
                Jsonb(state),
                UUID(workspace_id),
            ),
        ).fetchone()

    if row is None:
        raise ValueError("Workspace not found.")

    return _clean(row)


def get_interview(interview_id: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM interviews
            WHERE id = %s
            """,
            (UUID(interview_id),),
        ).fetchone()

    return _clean(row)


def get_latest_interview(workspace_id: str) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM interviews
            WHERE workspace_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (UUID(workspace_id),),
        ).fetchone()

    return _clean(row)


def save_interview(
    interview_id: str,
    state: dict,
    status: str,
    expected_version: int,
    feedback: dict | None = None,
) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            UPDATE interviews
            SET state = %s,
                status = %s,
                feedback = COALESCE(%s::jsonb, feedback),
                version = version + 1,
                updated_at = NOW()
            WHERE id = %s
              AND version = %s
            RETURNING *
            """,
            (
                Jsonb(state),
                status,
                Jsonb(feedback) if feedback is not None else None,
                UUID(interview_id),
                expected_version,
            ),
        ).fetchone()

    if row is None:
        raise ConflictError(
            "Interview changed or was deleted. Reload before saving."
        )

    return _clean(row)


# ---------- Generated results ----------


def save_artifact(
    workspace_id: str,
    kind: str,
    output: dict,
    intake_version: int,
    sources: list | None = None,
    meta: dict | None = None,
) -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            INSERT INTO artifacts (
                workspace_id,
                kind,
                intake_version,
                output,
                sources,
                meta
            )
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING *
            """,
            (
                UUID(workspace_id),
                kind,
                intake_version,
                Jsonb(output),
                Jsonb(sources if sources is not None else []),
                Jsonb(meta if meta is not None else {}),
            ),
        ).fetchone()

    return _clean(row)


def get_latest_artifact(
    workspace_id: str,
    kind: str,
    intake_version: int,
) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM artifacts
            WHERE workspace_id = %s
              AND kind = %s
              AND intake_version = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (
                UUID(workspace_id),
                kind,
                intake_version,
            ),
        ).fetchone()

    return _clean(row)

def get_latest_completed_interview(
    workspace_id: str,
    intake_version: int,
) -> dict | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM interviews
            WHERE workspace_id = %s
              AND intake_version = %s
              AND status = 'completed'
              AND feedback IS NOT NULL
              AND feedback <> 'null'::jsonb
              AND jsonb_array_length(
                  COALESCE(state->'turns', '[]'::jsonb)
              ) > 0
            ORDER BY updated_at DESC, created_at DESC, id DESC
            LIMIT 1
            """,
            (UUID(workspace_id), intake_version),
        ).fetchone()

    return _clean(row)