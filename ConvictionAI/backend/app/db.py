"""Database connection. Set DATABASE_URL in your environment or .env file."""
import os
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row

ROOT = Path(__file__).resolve().parents[2]


def _load_env_file() -> None:
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env_file()
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost:5432/conviction_ai")


@contextmanager
def connect():
    """Yields a connection that returns rows as dicts and commits on success."""
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
        yield conn
