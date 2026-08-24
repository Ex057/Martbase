#!/usr/bin/env python3
"""Restore human-readable ``period_variant`` values in DHIS2 serving tables.

The raw ``period`` column remains the sortable machine key. This utility adds
or fills the display-only ``period_variant`` column (eg ``202508`` →
``Aug 2025`` and ``2025Q3`` → ``2025 Q3``), then restores its Superset column
metadata for every SqlaTable linked to the selected staged dataset.

Use ``--dataset-id`` for a limited repair. ``--all`` is intentionally explicit
and targets every registered DHIS2 staged dataset. No charts are altered.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import sqlalchemy as sa

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--dataset-id", action="append", type=int, dest="dataset_ids")
    scope.add_argument("--all", action="store_true", help="Target all staged datasets")
    parser.add_argument("--apply", action="store_true", help="Execute the repair")
    return parser.parse_args()


def _parse_ref(reference: str) -> tuple[str, str]:
    parts = [part.strip().strip("`\"") for part in reference.split(".")]
    if len(parts) == 1:
        return "dhis2_serving", parts[0]
    return parts[-2], parts[-1]


def _quote(schema: str, table: str) -> str:
    return f"`{schema.replace('`', '``')}`.`{table.replace('`', '``')}`"


def _period_variant_sql() -> str:
    """Return the ClickHouse display expression for the raw ``period`` key."""
    value = "toString(`period`)"
    months = "['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']"
    month_numbers = "['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']"
    return (
        "multiIf("
        f"match({value}, '^[0-9]{{6}}$'), concat(transform(substring({value}, 5, 2), {month_numbers}, {months}), ' ', substring({value}, 1, 4)), "
        f"match({value}, '^[0-9]{{4}}Q[1-4]$'), concat(substring({value}, 1, 4), ' Q', substring({value}, 6, 1)), "
        f"match({value}, '^[0-9]{{4}}$'), {value}, "
        f"{value})"
    )


def _target_dataset_ids(args: argparse.Namespace) -> list[int]:
    from superset import db
    from superset.dhis2.models import DHIS2StagedDataset

    if args.dataset_ids:
        return list(dict.fromkeys(args.dataset_ids))
    return [
        int(row.id)
        for row in db.session.query(DHIS2StagedDataset)
        .order_by(DHIS2StagedDataset.id.asc())
        .all()
    ]


def _tables_for_dataset(dataset: Any) -> list[tuple[str, str]]:
    from superset.local_staging.engine_factory import get_active_staging_engine

    engine = get_active_staging_engine(dataset.database_id)
    schema, source_table = _parse_ref(engine.get_serving_sql_table_ref(dataset))
    tables = [(schema, source_table)]
    mart_table = f"{source_table}_mart"
    if (
        hasattr(engine, "named_table_exists_in_serving")
        and engine.named_table_exists_in_serving(mart_table)
    ):
        tables.append((schema, mart_table))
    return tables


def _repair_sqla_metadata(dataset_id: int) -> int:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable, TableColumn

    matches = (
        db.session.query(SqlaTable)
        .filter(
            SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
            | SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%')
        )
        .all()
    )
    updated = 0
    period_variant_extra = json.dumps(
        {
            "dhis2_is_period_hierarchy": True,
            "dhis2_period_key": "period_variant",
            "dhis2_is_period_display": True,
        }
    )
    for sqla_table in matches:
        column = next(
            (item for item in sqla_table.columns if item.column_name == "period_variant"),
            None,
        )
        if column is None:
            column = TableColumn(
                column_name="period_variant",
                verbose_name="Period Variant",
                type="STRING",
                is_dttm=False,
                groupby=True,
                filterable=True,
                is_active=True,
                extra=period_variant_extra,
            )
            sqla_table.columns.append(column)
        else:
            column.verbose_name = "Period Variant"
            column.type = "STRING"
            column.is_dttm = False
            column.groupby = True
            column.filterable = True
            column.extra = period_variant_extra
        updated += 1
    return updated


def _repair_one(dataset_id: int, apply: bool) -> dict[str, Any]:
    from superset import db
    from superset.dhis2.staged_dataset_service import get_staged_dataset
    from superset.dhis2.superset_dataset_service import get_clickhouse_serving_database

    dataset = get_staged_dataset(dataset_id)
    if dataset is None:
        raise ValueError(f"DHIS2StagedDataset id={dataset_id} not found")
    tables = _tables_for_dataset(dataset)
    report = {"dataset_id": dataset.id, "dataset_name": dataset.name, "tables": [_quote(*item) for item in tables], "applied": apply}
    if not apply:
        return report

    serving_database = get_clickhouse_serving_database()
    expression = _period_variant_sql()
    with serving_database.get_sqla_engine().connect() as connection:
        for schema, table in tables:
            table_ref = _quote(schema, table)
            connection.execute(
                sa.text(
                    f"ALTER TABLE {table_ref} ADD COLUMN IF NOT EXISTS "
                    "`period_variant` Nullable(String)"
                )
            )
            connection.execute(
                sa.text(
                    f"ALTER TABLE {table_ref} UPDATE `period_variant` = {expression} "
                    "WHERE `period` IS NOT NULL AND "
                    "(`period_variant` IS NULL OR `period_variant` = '' OR `period_variant` = `period`) "
                    "SETTINGS mutations_sync = 1"
                )
            )
    report["sqla_datasets_updated"] = _repair_sqla_metadata(dataset.id)
    db.session.commit()
    return report


def main() -> int:
    args = _parse_args()
    app = create_app()
    failures = 0
    with app.app_context():
        for dataset_id in _target_dataset_ids(args):
            try:
                print(json.dumps(_repair_one(dataset_id, args.apply), indent=2))
            except Exception as exc:  # pylint: disable=broad-except
                from superset import db

                db.session.rollback()
                failures += 1
                print(f"ERROR dataset id={dataset_id}: {exc}", file=sys.stderr)
    if not args.apply:
        print("Dry run only. Re-run with --apply to write labels.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
