#!/usr/bin/env python3
"""Read-only DHIS2 chart-engine comparison against the final Friday baseline.

This utility does not execute a chart query, refresh metadata, change caches,
or write to PostgreSQL/ClickHouse.  It compiles the captured chart-data request
through the installed QueryContextFactory and reports the SQL it would issue.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from typing import Any

from superset.app import create_app


FRIDAY_BASELINE = "88406f64b1"
TRACKED_PATHS = (
    "superset/connectors/sqla/models.py",
    "superset/common/query_context_processor.py",
    "superset/common/query_object_factory.py",
    "superset/dhis2/superset_dataset_service.py",
    "superset/dhis2/analytical_serving.py",
    "superset/commands/utils.py",
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument(
        "--request-json",
        type=Path,
        help="Full /api/v1/chart/data request body saved from browser Network",
    )
    parser.add_argument("--baseline", default=FRIDAY_BASELINE)
    return parser.parse_args()


def _load_production_environment() -> None:
    env_file = "/etc/superset/superset.env"
    if os.path.exists(env_file):
        with open(env_file, encoding="utf-8") as env_handle:
            for line in env_handle:
                if line.strip() and not line.startswith("#") and "=" in line:
                    key, value = line.strip().split("=", 1)
                    os.environ.setdefault(key, value.strip("\"'"))
    os.environ.setdefault("DHIS2_DISABLE_STARTUP_BACKFILL", "true")


def _git_output(args: list[str]) -> str:
    try:
        return subprocess.run(
            ["git", *args],
            check=True,
            text=True,
            capture_output=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError) as exc:
        return f"<unavailable: {exc}>"


def _read_request(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Unable to read --request-json {path}: {exc}") from exc
    if not isinstance(payload, dict):
        raise SystemExit("Request JSON root must be an object")
    if not isinstance(payload.get("datasource"), dict) or not isinstance(
        payload.get("queries"), list
    ):
        raise SystemExit("Request JSON must contain datasource and queries")
    return payload


def _column_snapshot(dataset: Any) -> list[dict[str, Any]]:
    return [
        {
            "column_name": column.column_name,
            "expression": getattr(column, "expression", None),
            "groupby": getattr(column, "groupby", None),
            "filterable": getattr(column, "filterable", None),
            "is_dttm": getattr(column, "is_dttm", None),
        }
        for column in dataset.columns
        if column.column_name in {"ou_level", "period", "period_variant"}
        or getattr(column, "expression", None)
    ]


def _compile_request(payload: dict[str, Any]) -> dict[str, Any]:
    """Compile only; do not call QueryContext.get_payload()/datasource.query()."""
    from superset.common.query_context_factory import QueryContextFactory

    context = QueryContextFactory().create(
        datasource=payload["datasource"],
        queries=payload["queries"],
        form_data=payload.get("form_data"),
        result_type=payload.get("result_type"),
        result_format=payload.get("result_format"),
        force=bool(payload.get("force", False)),
        custom_cache_timeout=payload.get("custom_cache_timeout"),
    )
    compiled_queries: list[dict[str, Any]] = []
    for index, query_object in enumerate(context.queries):
        query_dict = query_object.to_dict()
        compiled_queries.append(
            {
                "index": index,
                "query_object_filter": query_dict.get("filter"),
                "query_object_columns": query_dict.get("columns"),
                "query_object_metrics": query_dict.get("metrics"),
                "sql": context.datasource.get_query_str_extended(query_dict).sql,
            }
        )
    return compiled_queries


def main() -> int:
    args = _parse_args()
    _load_production_environment()
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.connectors.sqla.models import SqlaTable

        dataset = db.session.get(SqlaTable, args.dataset_id)
        if dataset is None:
            raise SystemExit(f"Dataset id={args.dataset_id} was not found")

        report: dict[str, Any] = {
            "mode": "read-only / no query execution",
            "baseline": args.baseline,
            "current_commit": _git_output(["rev-parse", "--short", "HEAD"]),
            "post_baseline_chart_commits": _git_output(
                [
                    "log",
                    "--format=%h %ad %s",
                    "--date=iso",
                    f"{args.baseline}..HEAD",
                    "--",
                    *TRACKED_PATHS,
                ]
            ).splitlines(),
            "post_baseline_numstat": _git_output(
                ["diff", "--numstat", f"{args.baseline}..HEAD", "--", *TRACKED_PATHS]
            ).splitlines(),
            "dataset": {
                "id": dataset.id,
                "table_name": dataset.table_name,
                "schema": dataset.schema,
                "database_id": dataset.database_id,
                "columns": _column_snapshot(dataset),
            },
        }
        if args.request_json:
            payload = _read_request(args.request_json)
            report["captured_request"] = {
                "path": str(args.request_json),
                "datasource": payload["datasource"],
                "query_count": len(payload["queries"]),
            }
            try:
                report["compiled_queries"] = _compile_request(payload)
            except Exception as exc:  # preserve partial diagnostic output
                report["compile_error"] = f"{type(exc).__name__}: {exc}"
        print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
