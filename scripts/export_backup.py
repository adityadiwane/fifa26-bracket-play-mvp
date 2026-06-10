"""Create a local backup from a SQLite/D1 export file.

For D1 remote usage, first export via Wrangler, then run this script against the
SQLite file. This script intentionally does not need network access.

Usage:
    python scripts/export_backup.py local.db backup.json
"""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

TABLES = ["leagues", "users", "matches", "predictions", "admin_audit_log"]


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: python scripts/export_backup.py local.db backup.json")
        return 2

    db_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    if not db_path.exists():
        print(f"Database file not found: {db_path}")
        return 1

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    backup: dict[str, list[dict[str, object]]] = {}
    for table in TABLES:
      try:
        rows = conn.execute(f"SELECT * FROM {table}").fetchall()
      except sqlite3.OperationalError:
        rows = []
      backup[table] = [dict(row) for row in rows]

    output_path.write_text(json.dumps(backup, indent=2), encoding="utf-8")
    print(f"Wrote backup to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
