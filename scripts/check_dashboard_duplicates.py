#!/usr/bin/env python3
from pathlib import Path
import sys


CHECKS = [
    (
        "frontend/src/pages/DashboardPage.jsx",
        {
            "const bucketSeries = summary.by_bucket || [];": 1,
            "const kpiDeltas = useMemo(() => {": 1,
            "const previous = summary.previous || {};": 1,
        },
    ),
    (
        "backend/src/routes/dashboard.js",
        {
            "const monthLabel =": 0,
            "const formatMonthLabel =": 1,
            "const twoDigits =": 1,
        },
    ),
]


def main() -> int:
    errors = []

    for file_path, patterns in CHECKS:
        content = Path(file_path).read_text(encoding="utf-8")
        for pattern, expected_count in patterns.items():
            count = content.count(pattern)
            if count != expected_count:
                errors.append(
                    f"{file_path}: expected {expected_count} occurrences of {pattern!r}, found {count}"
                )

    if errors:
        print("Dashboard duplication check failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print("Dashboard duplication check passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
