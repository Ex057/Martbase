#!/usr/bin/env python3
"""Read-only inspection of SQL expressions registered on a DHIS2 dataset.

Use this before any metadata cleanup. It reports expressions that Superset may
substitute for a physical ClickHouse column while compiling a chart query.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-id", type=int, required=True)
    parser.add_argument(
        "--check-ou-level",
        action="store_true",
        help="also run a harmless direct ClickHouse WHERE ou_level IN (3) check",
    )
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


def _expression(value: Any) -> str | None:
    text = str(value or "").strip()
    return text or None


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

        expression_columns = [
            {
                "column_name": column.column_name,
                "expression": expression,
                "is_dttm": column.is_dttm,
                "groupby": column.groupby,
                "filterable": column.filterable,
                "type": column.type,
            }
            for column in dataset.columns
            if (expression := _expression(getattr(column, "expression", None)))
        ]
        expression_metrics = [
            {
                "metric_name": metric.metric_name,
                "expression": expression,
            }
            for metric in dataset.metrics
            if (expression := _expression(getattr(metric, "expression", None)))
        ]
        ou_level = next(
            (column for column in dataset.columns if column.column_name == "ou_level"),
            None,
        )
        report: dict[str, Any] = {
            "mode": "read-only",
            "dataset": {
                "id": dataset.id,
                "table_name": dataset.table_name,
                "schema": dataset.schema,
                "database_id": dataset.database_id,
                "sql": dataset.sql,
            },
            "ou_level": None
            if ou_level is None
            else {
                "expression": _expression(ou_level.expression),
                "is_dttm": ou_level.is_dttm,
                "groupby": ou_level.groupby,
                "filterable": ou_level.filterable,
                "type": ou_level.type,
            },
            "columns_with_sql_expression": expression_columns,
            "metrics_with_sql_expression": expression_metrics,
        }

        if args.check_ou_level:
            try:
                database = dataset.get_serving_database()
                reference = f"`{dataset.schema}`.`{dataset.table_name}`"
                result = database.get_df(
                    f"SELECT count() AS rows FROM {reference} WHERE `ou_level` IN (3)"
                )
                report["direct_clickhouse_ou_level_check"] = {
                    "ok": True,
                    "rows": int(result.iloc[0, 0]),
                }
            except Exception as exc:  # diagnostic only; preserve the report
                report["direct_clickhouse_ou_level_check"] = {
                    "ok": False,
                    "error": str(exc),
                }

        print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
