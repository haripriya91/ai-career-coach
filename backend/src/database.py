import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

import logging
from contextlib import contextmanager
from psycopg_pool import PoolTimeout

logger = logging.getLogger("uvicorn.error")

BACKEND_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BACKEND_DIR / ".env")

_pool: ConnectionPool | None = None


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL")

    if not url:
        raise RuntimeError("DATABASE_URL is missing in backend/.env")

    return url


def open_pool():
    """Called once when this backend process starts."""
    global _pool

    if _pool is not None:
        return

    pool = ConnectionPool(
        conninfo=get_database_url(),
        min_size=1,
        max_size=4,
        timeout=10,
        check=ConnectionPool.check_connection,
        kwargs={
            "row_factory": dict_row,
            "connect_timeout": 10,
        },
        open=False,
    )

    try:
        pool.open(wait=True, timeout=15)
    except Exception as exc:
        logger.error(
            "Database pool startup failed: error_type=%s",
            type(exc).__name__,
        )
        pool.close()
        raise

    _pool = pool


def close_pool():
    """Called when the backend process shuts down."""
    global _pool

    if _pool is not None:
        _pool.close()
        _pool = None


@contextmanager
def get_connection():
    """Borrow a connection and log database failures."""
    if _pool is None:
        raise RuntimeError("Database pool has not been started.")

    try:
        with _pool.connection() as connection:
            yield connection

    except PoolTimeout:
        logger.error(
            "Database pool timeout: no usable connection became available. "
            "Pool stats: %s",
            _pool.get_stats(),
        )
        raise

    except psycopg.Error as exc:
        logger.error(
            "Database operation failed: error_type=%s sqlstate=%s",
            type(exc).__name__,
            exc.sqlstate,
        )
        raise


def create_tables():
    """Manual setup command; independent of the application pool."""
    sql = (BACKEND_DIR / "schema.sql").read_text(encoding="utf-8")

    with psycopg.connect(
        get_database_url(),
        connect_timeout=10,
    ) as connection:
        connection.execute(sql)


if __name__ == "__main__":
    create_tables()
    print("Tables are ready.")