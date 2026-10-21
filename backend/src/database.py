import logging
import os
from contextlib import contextmanager
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


logger = logging.getLogger("uvicorn.error")

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")

    if not url:
        raise RuntimeError("DATABASE_URL is missing in backend/.env")

    return url


@contextmanager
def get_connection():
    """Open, commit or roll back, then close one connection."""
    try:
        with psycopg.connect(
            get_database_url(),
            row_factory=dict_row,
            connect_timeout=10,
        ) as connection:
            yield connection

    except psycopg.Error as exc:
        logger.error(
            "Database operation failed: error_type=%s sqlstate=%s",
            type(exc).__name__,
            exc.sqlstate,
        )
        raise


def create_tables():
    """Manual setup command."""
    sql = (BACKEND_DIR / "schema.sql").read_text(encoding="utf-8")

    with get_connection() as connection:
        connection.execute(sql)


if __name__ == "__main__":
    create_tables()
    print("Tables are ready.")