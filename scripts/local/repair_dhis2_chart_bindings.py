"""
Repair DHIS2 chart bindings in a live Superset metadata DB.

Run inside an env-loaded ``superset shell`` session:

    exec(open('/opt/dhis2-superset/scripts/local/repair_dhis2_chart_bindings.py').read())

Optional environment variables:

    DHIS2_REPAIR_STAGED_DATASET_ID=31
    DHIS2_REPAIR_DATASET_ROLE=SOURCE
    DHIS2_REPAIR_VALIDATE=1

If ``DHIS2_REPAIR_STAGED_DATASET_ID`` is not set, the script falls back to the
full compatibility backfill and repairs every staged dataset it can resolve.
"""

from __future__ import annotations

import json
import os
from typing import Any


def _env_int(name: str) -> int | None:
    raw_value = os.environ.get(name)
    if raw_value is None or not str(raw_value).strip():
        return None
    try:
        return int(raw_value)
    except ValueError:
        return None


def _print_json(title: str, payload: Any) -> None:
    print(title)
    print(json.dumps(payload, indent=2, sort_keys=True, default=str))


def _collect_invalid_columns(chart: Any, datasource: Any) -> dict[str, list[str]]:
    from superset.utils.core import get_column_names_from_columns, get_column_names_from_metrics

    invalid: dict[str, list[str]] = {}
    for attr in ("params", "query_context"):
        raw_value = getattr(chart, attr, None)
        if not raw_value:
            continue
        try:
            parsed = json.loads(raw_value)
        except Exception:  # pylint: disable=broad-except
            continue
        if not isinstance(parsed, dict):
            continue
        query_context = parsed.get("form_data") if attr == "query_context" else parsed
        if not isinstance(query_context, dict):
            continue
        columns = get_column_names_from_columns(query_context.get("columns") or [])
        columns += get_column_names_from_columns(query_context.get("groupby") or [])
        columns += get_column_names_from_metrics(query_context.get("metrics") or [])
        stale = [
            column
            for column in columns
            if column not in (getattr(datasource, "column_names", []) or [])
        ]
        if stale:
            invalid[attr] = stale
    return invalid


def main() -> None:
    from superset import db
    from superset.dhis2.backfill import repair_dhis2_chart_metadata_backfill
    from superset.dhis2.superset_dataset_service import (
        _get_dhis2_sqla_table,
        repair_charts_for_dhis2_staged_dataset,
    )
    from superset.models.slice import Slice

    staged_dataset_id = _env_int("DHIS2_REPAIR_STAGED_DATASET_ID")
    dataset_role = os.environ.get("DHIS2_REPAIR_DATASET_ROLE")
    validate = os.environ.get("DHIS2_REPAIR_VALIDATE", "0").strip() not in {"", "0", "false", "False"}

    if staged_dataset_id is None:
        print("Running full DHIS2 chart metadata backfill...")
        stats = repair_dhis2_chart_metadata_backfill()
        _print_json("Backfill stats:", stats)
        return

    print(
        f"Repairing DHIS2 chart bindings for staged_dataset_id={staged_dataset_id}"
        + (f" role={dataset_role}" if dataset_role else "")
    )
    repaired = repair_charts_for_dhis2_staged_dataset(staged_dataset_id, dataset_role)
    print(f"Repaired charts: {repaired}")

    if not validate:
        return

    datasource = _get_dhis2_sqla_table(staged_dataset_id, dataset_role)
    if datasource is None:
        print("Validation skipped: datasource could not be resolved after repair")
        return

    charts = (
        db.session.query(Slice)
        .filter(Slice.datasource_id == datasource.id, Slice.datasource_type == datasource.datasource_type)
        .all()
    )
    print(f"Validating {len(charts)} charts against {getattr(datasource, 'table_name', None)}")
    for chart in charts:
        invalid = _collect_invalid_columns(chart, datasource)
        if invalid:
            _print_json(
                f"Chart {chart.id} ({getattr(chart, 'slice_name', None)}) still has invalid columns:",
                invalid,
            )


if __name__ == "__main__":
    main()
