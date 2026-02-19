#!/usr/bin/env python3
"""Guardrails for database/init/001_schema.sql.

Fails when duplicate CREATE TABLE / CREATE INDEX statements are detected.
Also performs simple readability and sanity checks.
"""

from __future__ import annotations

import re
import sys
from collections import Counter
from pathlib import Path

SCHEMA_PATH = Path("database/init/001_schema.sql")
MIN_NEWLINES = 40
CORE_TABLES = {"companies", "users", "transactions"}

CREATE_TABLE_RE = re.compile(
    r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)",
    re.IGNORECASE,
)
CREATE_INDEX_RE = re.compile(
    r"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z_][\w]*)",
    re.IGNORECASE,
)


def find_duplicates(items: list[str]) -> list[str]:
    counts = Counter(item.lower() for item in items)
    return sorted(name for name, count in counts.items() if count > 1)


def main() -> int:
    if not SCHEMA_PATH.exists():
        print(f"Schema file not found: {SCHEMA_PATH}")
        return 1

    sql = SCHEMA_PATH.read_text(encoding="utf-8")

    table_names = CREATE_TABLE_RE.findall(sql)
    index_names = CREATE_INDEX_RE.findall(sql)

    duplicate_tables = find_duplicates(table_names)
    duplicate_indexes = find_duplicates(index_names)

    failed = False

    if duplicate_tables:
        print(f"Duplicate tables: {duplicate_tables}")
        failed = True

    if duplicate_indexes:
        print(f"Duplicate indexes: {duplicate_indexes}")
        failed = True

    newline_count = sql.count("\n")
    if newline_count < MIN_NEWLINES:
        print(
            "Schema formatting check failed: "
            f"found only {newline_count} newlines (< {MIN_NEWLINES})."
        )
        failed = True

    table_set = {name.lower() for name in table_names}
    missing_core_tables = sorted(CORE_TABLES - table_set)
    if missing_core_tables:
        print(f"Missing core tables: {missing_core_tables}")
        failed = True

    if failed:
        return 1

    print(
        "Schema duplicate check passed: "
        f"{len(table_set)} tables, {len({name.lower() for name in index_names})} indexes, "
        f"{newline_count} newlines."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
