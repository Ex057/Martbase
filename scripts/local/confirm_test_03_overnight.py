"""
Read-only overnight verification for the `test_03_dataset` staged dataset.

Primary use inside an env-loaded `superset shell` session on the server:

    exec(open('/tmp/confirm_test_03_overnight.py').read())

Optional environment variables:

    DHIS2_CONFIRM_DATASET=test_03_dataset
    DHIS2_CONFIRM_CHART=test_03

The script prints:
1. matching staged datasets
2. matching SqlaTable rows
3. matching charts and their datasource bindings
4. whether any matching chart is bound to SOURCE vs MART/METADATA
5. the most recent sync jobs for the newest matching staged dataset
"""

from __future__ import annotations

import json
import os
import re
from typing import Any


def _normalize_text(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _matches(value: Any, needle: str) -> bool:
    haystack = _normalize_text(value)
    return bool(haystack) and needle in haystack


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


def _dataset_target() -> str:
    return _normalize_text(os.environ.get("DHIS2_CONFIRM_DATASET", "test_03_dataset"))


def _chart_target() -> str:
    return _normalize_text(os.environ.get("DHIS2_CONFIRM_CHART", "test_03"))


def main() -> None:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.dhis2.models import DHIS2StagedDataset, DHIS2SyncJob
    from superset.models.slice import Slice

    dataset_target = _dataset_target()
    chart_target = _chart_target()

    _print_section("Targets")
    print({"dataset": dataset_target, "chart": chart_target})

    staged_rows = (
        db.session.query(DHIS2StagedDataset)
        .order_by(DHIS2StagedDataset.id.desc())
        .all()
    )
    matching_staged = [
        dataset
        for dataset in staged_rows
        if _matches(getattr(dataset, "name", None), dataset_target)
    ]

    _print_section("Matching staged datasets")
    if not matching_staged:
        print("none")
    else:
        for dataset in matching_staged:
            print(
                {
                    "id": dataset.id,
                    "name": dataset.name,
                    "database_id": dataset.database_id,
                    "serving_superset_dataset_id": dataset.serving_superset_dataset_id,
                    "is_active": getattr(dataset, "is_active", None),
                    "last_sync_status": getattr(dataset, "last_sync_status", None),
                    "last_sync_at": str(getattr(dataset, "last_sync_at", None)),
                }
            )

    sqla_rows = db.session.query(SqlaTable).order_by(SqlaTable.id.asc()).all()
    matching_sqla: list[tuple[Any, dict[str, Any]]] = []
    for table in sqla_rows:
        extra = _parse_extra(getattr(table, "extra", None))
        blob = " | ".join(
            [
                str(getattr(table, "table_name", "") or ""),
                str(getattr(table, "schema", "") or ""),
                str(extra.get("dhis2_serving_table_ref") or ""),
                str(extra.get("dhis2_dataset_display_name") or ""),
            ]
        )
        if _matches(blob, dataset_target):
            matching_sqla.append((table, extra))

    _print_section("Matching SqlaTable rows")
    if not matching_sqla:
        print("none")
    else:
        for table, extra in matching_sqla:
            print(
                {
                    "id": table.id,
                    "table_name": table.table_name,
                    "schema": table.schema,
                    "database_id": table.database_id,
                    "dataset_role": getattr(table, "dataset_role", None),
                    "staged_dataset_id": _extract_staged_dataset_id(extra),
                    "serving_table_ref": extra.get("dhis2_serving_table_ref"),
                }
            )

    chart_rows = (
        db.session.query(Slice)
        .filter(Slice.datasource_type == "table")
        .order_by(Slice.id.asc())
        .all()
    )
    matching_charts = [
        chart
        for chart in chart_rows
        if _matches(getattr(chart, "slice_name", None), chart_target)
    ]

    _print_section("Matching charts")
    if not matching_charts:
        print("none")
    else:
        for chart in matching_charts:
            datasource = (
                db.session.get(SqlaTable, chart.datasource_id)
                if getattr(chart, "datasource_id", None) is not None
                else None
            )
            datasource_extra = _parse_extra(getattr(datasource, "extra", None))
            print(
                {
                    "chart_id": chart.id,
                    "chart_name": chart.slice_name,
                    "datasource_id": chart.datasource_id,
                    "datasource_name": chart.datasource_name,
                    "datasource_role": getattr(datasource, "dataset_role", None)
                    if datasource is not None
                    else None,
                    "datasource_table": getattr(datasource, "table_name", None)
                    if datasource is not None
                    else None,
                    "staged_dataset_id": _extract_staged_dataset_id(datasource_extra),
                }
            )

    _print_section("Chart binding verdict")
    if not matching_charts:
        print("no matching charts found")
    else:
        for chart in matching_charts:
            datasource = (
                db.session.get(SqlaTable, chart.datasource_id)
                if getattr(chart, "datasource_id", None) is not None
                else None
            )
            role = str(getattr(datasource, "dataset_role", "") or "").strip()
            if role == "DHIS2_SOURCE_DATASET":
                verdict = "BAD: chart drifted to SOURCE"
            elif role in {"MART", "METADATA"}:
                verdict = "OK: chart bound to eligible role"
            elif datasource is None:
                verdict = "BAD: datasource row missing"
            else:
                verdict = f"CHECK: unexpected role {role!r}"
            print({"chart_id": chart.id, "verdict": verdict})

    newest_dataset = matching_staged[0] if matching_staged else None
    _print_section("Recent sync jobs")
    if newest_dataset is None:
        print("skipped: no matching staged dataset")
    else:
        jobs = (
            db.session.query(DHIS2SyncJob)
            .filter(DHIS2SyncJob.staged_dataset_id == newest_dataset.id)
            .order_by(DHIS2SyncJob.id.desc())
            .limit(10)
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


if __name__ == "__main__":
    main()
