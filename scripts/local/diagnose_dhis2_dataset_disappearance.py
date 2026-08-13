"""
Read-only DHIS2 dataset disappearance diagnostics for production triage.

Primary use is inside an env-loaded ``superset shell`` session on the server:

    exec(open('/tmp/diagnose_dhis2_dataset_disappearance.py').read())

Optional configuration via environment variables:

    DHIS2_DIAG_TARGET=mal_pregnancy
    DHIS2_DIAG_LIMIT=10

The script does not mutate metadata or physical tables. It only prints:
1. matching staged datasets
2. matching SqlaTable rows
3. orphaned SqlaTable rows that still reference missing staged datasets
4. recent sync jobs for the newest matching staged dataset
"""

from __future__ import annotations

import json
import os
import re
from collections.abc import Iterable
from typing import Any


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _normalize_needles(values: Iterable[str]) -> list[str]:
    normalized: list[str] = []
    for value in values:
        candidate = _normalize_text(value)
        if candidate and candidate not in normalized:
            normalized.append(candidate)
    return normalized


def _matches_any(value: Any, needles: Iterable[str]) -> bool:
    haystack = _normalize_text(value)
    return bool(haystack) and any(needle in haystack for needle in needles)


def _parse_extra(raw_extra: Any) -> dict[str, Any]:
    if isinstance(raw_extra, dict):
        return raw_extra
    if isinstance(raw_extra, str) and raw_extra.strip():
        try:
            parsed = json.loads(raw_extra)
        except (TypeError, ValueError):
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _extract_staged_dataset_id(raw_extra: Any) -> int | None:
    extra = _parse_extra(raw_extra)
    raw_value = extra.get("dhis2_staged_dataset_id")
    if raw_value is None and isinstance(raw_extra, str):
        match = re.search(r'"dhis2_staged_dataset_id":\s*(\d+)', raw_extra)
        if match:
            raw_value = match.group(1)
    try:
        staged_id = int(raw_value)
    except (TypeError, ValueError):
        return None
    return staged_id if staged_id > 0 else None


def _print_section(title: str) -> None:
    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def _target_tokens() -> list[str]:
    raw_target = os.environ.get("DHIS2_DIAG_TARGET", "mal_pregnancy")
    parts = [part.strip() for part in raw_target.split(",")]
    return _normalize_needles(parts)


def _limit() -> int:
    try:
        value = int(os.environ.get("DHIS2_DIAG_LIMIT", "10"))
    except ValueError:
        value = 10
    return max(1, value)


def main() -> None:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.dhis2.models import DHIS2StagedDataset, DHIS2SyncJob

    targets = _target_tokens()
    result_limit = _limit()

    _print_section("Target")
    print("needles:", targets)
    print("limit:", result_limit)

    staged_rows = (
        db.session.query(DHIS2StagedDataset)
        .order_by(DHIS2StagedDataset.id.desc())
        .all()
    )
    matching_staged = [
        dataset
        for dataset in staged_rows
        if _matches_any(getattr(dataset, "name", None), targets)
    ]
    

    _print_section("Matching staged datasets")
    if not matching_staged:
        print("none")
    else:
        for dataset in matching_staged[:result_limit]:
            print(
                {
                    "id": dataset.id,
                    "name": dataset.name,
                    "database_id": dataset.database_id,
                    "serving_superset_dataset_id": dataset.serving_superset_dataset_id,
                    "is_active": getattr(dataset, "is_active", None),
                    "updated_on": str(getattr(dataset, "updated_on", None)),
                }
            )

    sqla_rows = db.session.query(SqlaTable).order_by(SqlaTable.id.desc()).all()
    matching_sqla = []
    for table in sqla_rows:
        extra = _parse_extra(getattr(table, "extra", None))
        blob = " | ".join(
            [
                str(getattr(table, "table_name", "") or ""),
                str(getattr(table, "schema", "") or ""),
                str(getattr(table, "sql", "") or ""),
                str(extra.get("dhis2_serving_table_ref") or ""),
                str(extra.get("dhis2_dataset_display_name") or ""),
            ]
        )
        if _matches_any(blob, targets):
            matching_sqla.append((table, extra))

    _print_section("Matching SqlaTable rows")
    if not matching_sqla:
        print("none")
    else:
        for table, extra in matching_sqla[:result_limit]:
            print(
                {
                    "id": table.id,
                    "table_name": table.table_name,
                    "schema": table.schema,
                    "database_id": table.database_id,
                    "dataset_role": getattr(table, "dataset_role", None),
                    "staged_dataset_id": _extract_staged_dataset_id(extra),
                    "serving_table_ref": extra.get("dhis2_serving_table_ref"),
                    "sql": table.sql,
                }
            )

    staged_ids = {dataset.id for dataset in staged_rows}
    orphaned_sqla: list[tuple[Any, int | None]] = []
    for table in sqla_rows:
        staged_id = _extract_staged_dataset_id(getattr(table, "extra", None))
        if staged_id is not None and staged_id not in staged_ids:
            orphaned_sqla.append((table, staged_id))

    _print_section("Orphaned SqlaTable rows")
    if not orphaned_sqla:
        print("none")
    else:
        for table, staged_id in orphaned_sqla[:result_limit]:
            print(
                {
                    "id": table.id,
                    "table_name": table.table_name,
                    "schema": table.schema,
                    "database_id": table.database_id,
                    "dataset_role": getattr(table, "dataset_role", None),
                    "missing_staged_dataset_id": staged_id,
                }
            )

    newest_dataset = matching_staged[0] if matching_staged else None
    _print_section("Recent sync jobs")
    if newest_dataset is None:
        print("skipped: no matching staged dataset")
    else:
        jobs = (
            db.session.query(DHIS2SyncJob)
            .filter(DHIS2SyncJob.staged_dataset_id == newest_dataset.id)
            .order_by(DHIS2SyncJob.id.desc())
            .limit(result_limit)
            .all()
        )
        if not jobs:
            print(f"none for staged_dataset_id={newest_dataset.id}")
        else:
            for job in jobs:
                print(
                    {
                        "id": job.id,
                        "job_type": getattr(job, "job_type", None),
                        "status": getattr(job, "status", None),
                        "created_on": str(getattr(job, "created_on", None)),
                        "started_at": str(getattr(job, "started_at", None)),
                        "finished_at": str(getattr(job, "finished_at", None)),
                    }
                )

    _print_section("Next log command")
    print(
        "sudo journalctl -u superset -u superset-worker -u superset-beat "
        '--since "2026-08-09 00:00:00" --no-pager | '
        'rg "cleaning up DHIS2StagedDataset|keeping it|register_dataset|'
        'ensure_serving_table|Failed to create staged dataset|'
        'Unexpected error creating DHIS2StagedDataset|'
        'auto-register as Superset dataset failed|mal_pregnancy"'
    )


if __name__ == "__main__":
    main()
