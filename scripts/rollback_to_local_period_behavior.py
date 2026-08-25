#!/usr/bin/env python3
"""Restore physical DHIS2 period columns without changing ClickHouse data.

The default is a dry run.  Pass ``--apply`` only after reviewing the JSON
summary.  This script changes PostgreSQL metadata and chart payloads; it never
executes DDL or DML against ClickHouse.
"""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable
from typing import Any

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        dest="apply",
        action="store_false",
        help="report changes only (the default)",
    )
    mode.add_argument(
        "--apply",
        action="store_true",
        help="commit the reported PostgreSQL changes",
    )
    parser.set_defaults(apply=False)
    return parser.parse_args()


def _json_object(
    raw: Any, *, chart_id: int, field: str, errors: list[dict[str, Any]]
) -> dict[str, Any] | None:
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError) as exc:
        errors.append({"chart_id": chart_id, "field": field, "error": str(exc)})
        return None
    if not isinstance(value, dict):
        errors.append(
            {"chart_id": chart_id, "field": field, "error": "JSON root is not an object"}
        )
        return None
    return value


def _is_dhis2_dataset(dataset: Any) -> bool:
    if getattr(dataset, "schema", None) == "dhis2_serving":
        return True
    try:
        extra = json.loads(getattr(dataset, "extra", None) or "{}")
    except (TypeError, json.JSONDecodeError):
        return False
    return bool(
        extra.get("dhis2_staged_dataset_id")
        or extra.get("dhis2_staged_local")
        or extra.get("dhis2_serving")
    )


def _remove_injected_period(dimensions: list[Any]) -> bool:
    """Remove raw ``period`` only when its display companion is selected."""
    if "period" not in dimensions or "period_variant" not in dimensions:
        return False
    dimensions[:] = [item for item in dimensions if item != "period"]
    return True


def _repair_payload(payload: dict[str, Any]) -> tuple[bool, list[str]]:
    """Undo structural period mutations recursively, preserving metrics."""
    changed_paths: list[str] = []

    def visit(value: Any, path: str) -> None:
        if isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, f"{path}[{index}]")
            return
        if not isinstance(value, dict):
            return

        for key in ("groupby", "columns"):
            dimensions = value.get(key)
            if isinstance(dimensions, list) and _remove_injected_period(dimensions):
                changed_paths.append(f"{path}.{key}")

        selected_dimensions: set[str] = set()
        for key in ("groupby", "columns"):
            dimensions = value.get(key)
            if isinstance(dimensions, list):
                selected_dimensions.update(
                    item for item in dimensions if isinstance(item, str)
                )

        # Raw period is only valid in ORDER BY when it remains selected.  Do
        # not substitute period_variant: the physical dataset / user controls
        # decide sorting, rather than this persistence repair.
        orderby = value.get("orderby")
        if isinstance(orderby, list) and "period" not in selected_dimensions:
            repaired_orderby = [
                item
                for item in orderby
                if not (
                    isinstance(item, (list, tuple))
                    and len(item) >= 1
                    and item[0] == "period"
                )
            ]
            if repaired_orderby != orderby:
                value["orderby"] = repaired_orderby
                changed_paths.append(f"{path}.orderby")

        for key, child in value.items():
            visit(child, f"{path}.{key}")

    visit(payload, "$")
    return bool(changed_paths), changed_paths


def _metadata_changes(dataset: Any, *, apply: bool) -> list[str]:
    changes: list[str] = []
    for column in getattr(dataset, "columns", []) or []:
        name = getattr(column, "column_name", None)
        if name == "period_variant":
            if getattr(column, "expression", None) is not None:
                if apply:
                    column.expression = None
                changes.append("period_variant.expression")
            if getattr(column, "is_dttm", False):
                if apply:
                    column.is_dttm = False
                changes.append("period_variant.is_dttm")
            if not getattr(column, "groupby", False):
                if apply:
                    column.groupby = True
                changes.append("period_variant.groupby")
            if not getattr(column, "filterable", False):
                if apply:
                    column.filterable = True
                changes.append("period_variant.filterable")
        elif name == "period":
            if getattr(column, "is_dttm", False):
                if apply:
                    column.is_dttm = False
                changes.append("period.is_dttm")
            if getattr(column, "python_date_format", None) is not None:
                if apply:
                    column.python_date_format = None
                changes.append("period.python_date_format")
            if not getattr(column, "groupby", False):
                if apply:
                    column.groupby = True
                changes.append("period.groupby")
            if not getattr(column, "filterable", False):
                if apply:
                    column.filterable = True
                changes.append("period.filterable")
    return changes


def _charts_for_datasets(charts: Iterable[Any]) -> Iterable[Any]:
    for chart in charts:
        if _is_dhis2_dataset(getattr(chart, "datasource", None)):
            yield chart


def main() -> int:
    args = _parse_args()

    # Allow the utility to be invoked directly with the production virtualenv.
    # Superset otherwise rejects startup before it can create an application
    # context when SECRET_KEY and related settings only live in this file.
    env_file = "/etc/superset/superset.env"
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as env_handle:
            for line in env_handle:
                if line.strip() and not line.startswith("#") and "=" in line:
                    key, value = line.strip().split("=", 1)
                    os.environ.setdefault(key, value.strip("\"'"))
    os.environ.setdefault("DHIS2_DISABLE_STARTUP_BACKFILL", "true")

    app = create_app()
    with app.app_context():
        from superset import db
        from superset.connectors.sqla.models import SqlaTable
        from superset.models.slice import Slice

        report: dict[str, Any] = {
            "mode": "apply" if args.apply else "dry-run",
            "clickhouse_mutated": False,
            "datasets": [],
            "charts": [],
            "errors": [],
        }
        for dataset in db.session.query(SqlaTable).all():
            if not _is_dhis2_dataset(dataset):
                continue
            changes = _metadata_changes(dataset, apply=args.apply)
            if changes:
                report["datasets"].append(
                    {"dataset_id": dataset.id, "table_name": dataset.table_name, "changes": changes}
                )

        for chart in _charts_for_datasets(db.session.query(Slice).all()):
            fields: dict[str, list[str]] = {}
            for field in ("params", "query_context"):
                payload = _json_object(
                    getattr(chart, field, None),
                    chart_id=chart.id,
                    field=field,
                    errors=report["errors"],
                )
                if payload is None:
                    continue
                changed, paths = _repair_payload(payload)
                if changed:
                    fields[field] = paths
                    if args.apply:
                        setattr(chart, field, json.dumps(payload))
            if fields:
                report["charts"].append(
                    {"chart_id": chart.id, "chart_name": chart.slice_name, "fields": fields}
                )

        if args.apply:
            db.session.commit()
        else:
            db.session.rollback()

        report["summary"] = {
            "datasets_changed": len(report["datasets"]),
            "charts_changed": len(report["charts"]),
            "payload_errors": len(report["errors"]),
        }
        print(json.dumps(report, indent=2, default=str))
    return 0 if not report["errors"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
