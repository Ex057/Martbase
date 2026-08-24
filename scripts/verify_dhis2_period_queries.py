#!/usr/bin/env python3
"""Verify that DHIS2 serving periods produce non-null ClickHouse timestamps.

This is read-only. It checks the real physical serving MART when present and
fails if a table has period rows but the native DHIS2 period expression cannot
turn any of them into calendar timestamps.

Example:
    /opt/superset-venv/bin/python scripts/verify_dhis2_period_queries.py \\
        --dataset-id 9 --dataset-id 28 --dataset-id 35
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-id",
        dest="dataset_ids",
        type=int,
        action="append",
        help="DHIS2 staged dataset ID to verify; repeat as needed.",
    )
    parser.add_argument(
        "--chart-id",
        dest="chart_ids",
        type=int,
        action="append",
        help="Chart ID whose saved time controls should be audited; repeat as needed.",
    )
    parser.add_argument("--sample-limit", type=int, default=10)
    return parser.parse_args()


def _quote_ref(schema: str | None, table: str) -> str:
    quoted_table = "`" + table.replace("`", "``") + "`"
    if not schema:
        return quoted_table
    return "`" + schema.replace("`", "``") + "`." + quoted_table


def _parse_ref(reference: str) -> tuple[str | None, str]:
    parts = [part.strip().strip("`\"") for part in reference.split(".")]
    return (parts[-2], parts[-1]) if len(parts) > 1 else (None, parts[-1])


def _verify(dataset_id: int, sample_limit: int) -> dict[str, Any]:
    from superset.dhis2.staged_dataset_service import get_staged_dataset
    from superset.dhis2.superset_dataset_service import get_clickhouse_serving_database
    from superset.connectors.sqla.models import get_dhis2_clickhouse_period_expression
    from superset.local_staging.engine_factory import get_active_staging_engine

    dataset = get_staged_dataset(dataset_id)
    if dataset is None:
        raise ValueError(f"DHIS2StagedDataset id={dataset_id} not found")
    engine = get_active_staging_engine(dataset.database_id)
    base_ref = engine.get_serving_sql_table_ref(dataset)
    schema, base_table = _parse_ref(base_ref)
    mart_table = f"{base_table}_mart"
    table_name = (
        mart_table
        if hasattr(engine, "named_table_exists_in_serving")
        and engine.named_table_exists_in_serving(mart_table)
        else base_table
    )
    table_ref = _quote_ref(schema or "dhis2_serving", table_name)
    database = get_clickhouse_serving_database()
    period_expr = get_dhis2_clickhouse_period_expression("period")

    stats_sql = f"""
        SELECT
          count() AS total_rows,
          countIf(`period` != '') AS period_rows,
          countIf({period_expr} IS NOT NULL) AS parsed_rows,
          countIf(`period` != '' AND {period_expr} IS NULL) AS unparsed_rows
        FROM {table_ref}
    """
    stats = database.get_df(stats_sql).iloc[0].to_dict()
    samples_sql = f"""
        SELECT `period` AS raw_period, {period_expr} AS parsed_period
        FROM {table_ref}
        WHERE `period` != ''
        ORDER BY parsed_period ASC
        LIMIT {max(1, sample_limit)}
    """
    samples = database.get_df(samples_sql).to_dict(orient="records")
    report = {
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "table": table_ref,
        "stats": {key: int(value) for key, value in stats.items()},
        "samples": samples,
    }
    if report["stats"]["period_rows"] and not report["stats"]["parsed_rows"]:
        raise RuntimeError(
            f"No non-null parsed periods returned for dataset id={dataset.id}"
        )
    return report


def _loads_object(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _audit_chart(chart_id: int) -> dict[str, Any]:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.slice import Slice

    chart = db.session.get(Slice, chart_id)
    if chart is None:
        raise ValueError(f"Chart id={chart_id} not found")
    datasource = db.session.get(SqlaTable, chart.datasource_id)
    params = _loads_object(chart.params)
    query_context = _loads_object(chart.query_context)
    form_data = query_context.get("form_data")
    if not isinstance(form_data, dict):
        form_data = params
    available = {
        str(column.column_name)
        for column in (datasource.columns if datasource is not None else [])
        if column.column_name
    }
    control_keys = ("granularity", "granularity_sqla", "time_grain_sqla", "time_range", "x_axis")
    controls = {key: form_data.get(key) for key in control_keys if key in form_data}
    column_controls = {
        key: value
        for key, value in controls.items()
        if key in {"granularity", "granularity_sqla", "x_axis"}
        and isinstance(value, str)
        and value not in available
    }
    return {
        "chart_id": chart.id,
        "chart_name": chart.slice_name,
        "datasource_id": chart.datasource_id,
        "datasource_name": getattr(datasource, "table_name", None),
        "available_columns": sorted(available),
        "time_controls": controls,
        "stale_column_controls": column_controls,
    }


def main() -> int:
    args = _parse_args()
    if not args.dataset_ids and not args.chart_ids:
        raise SystemExit("Pass at least one --dataset-id or --chart-id")
    app = create_app()
    failures = 0
    with app.app_context():
        for dataset_id in list(dict.fromkeys(args.dataset_ids or [])):
            try:
                print(json.dumps(_verify(dataset_id, args.sample_limit), default=str, indent=2))
            except Exception as exc:  # pylint: disable=broad-except
                failures += 1
                print(f"ERROR dataset id={dataset_id}: {exc}", file=sys.stderr)
        for chart_id in list(dict.fromkeys(args.chart_ids or [])):
            try:
                print(json.dumps(_audit_chart(chart_id), default=str, indent=2))
            except Exception as exc:  # pylint: disable=broad-except
                failures += 1
                print(f"ERROR chart id={chart_id}: {exc}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
