"""Import a company pack into the database.

Run from the repo root:  python backend/import_pack.py packs/clearops.json
(or: make import PACK=packs/clearops.json). Safe to re-run.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.db import connect  # noqa: E402
from app.packs import import_pack  # noqa: E402

if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python backend/import_pack.py packs/<company>.json")
    path = Path(sys.argv[1])
    try:
        pack = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as e:
        sys.exit(f"Could not read {path}: {e}")
    try:
        with connect() as conn:
            print("imported:", import_pack(conn, pack, path.name))
    except ValueError as e:
        sys.exit(str(e))
