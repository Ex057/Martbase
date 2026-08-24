#!/usr/bin/env python3
"""Stabilize categorical DHIS2 period metadata in registered datasets.

The raw ``period`` column remains the sortable machine key and is explicitly
non-temporal. This utility removes the temporary generated ``period_variant``
expression that was injected into chart SQL, while preserving physical serving
columns and their values. It intentionally does not rebuild, alter, or mutate
any ClickHouse serving table.

Use ``--dataset-id`` for a limited repair. ``--all`` is intentionally explicit
and targets every registered DHIS2 staged dataset. No charts are altered.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--dataset-id", action="append", type=int, dest="dataset_ids")
    scope.add_argument("--all", action="store_true", help="Target all staged datasets")
    parser.add_argument("--apply", action="store_true", help="Execute the repair")
    return parser.parse_args()


def _is_generated_period_display_expression(expression: Any) -> bool:
    """Whether an expression is the temporary generated period label SQL."""
    normalized = " ".join(str(expression or "").lower().split())
    return (
        "multiif(" in normalized
        and "tostring(`period`)" in normalized
        and "substring(tostring(`period`), 5, 2)" in normalized
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


def _repair_sqla_metadata(dataset_id: int) -> int:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    matches = (
        db.session.query(SqlaTable)
        .filter(
            SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
            | SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%')
        )
        .all()
    )
    updated = 0
    for sqla_table in matches:
        changed = False
        raw_period = next(
            (item for item in sqla_table.columns if item.column_name == "period"),
            None,
        )
        if raw_period is not None:
            # Undo metadata written by the temporary DateTime conversion path.
            # Compact DHIS2 tokens are categorical keys and must not activate
            # Superset's time-grain/epoch handling.
            if raw_period.is_dttm:
                raw_period.is_dttm = False
                changed = True
            if raw_period.python_date_format:
                raw_period.python_date_format = None
                changed = True

        column = next(
            (item for item in sqla_table.columns if item.column_name == "period_variant"),
            None,
        )
        if column is not None and _is_generated_period_display_expression(column.expression):
            column.expression = None
            changed = True

        # ``ou_level`` is a hierarchy dimension. It must never become an
        # aggregate metric when used by an Explore WHERE filter.
        ou_column = next(
            (item for item in sqla_table.columns if item.column_name == "ou_level"),
            None,
        )
        if ou_column is not None:
            ou_column.groupby = True
            ou_column.filterable = True
            if ou_column.is_dttm:
                ou_column.is_dttm = False
                changed = True
        if changed:
            updated += 1
    return updated


def _repair_one(dataset_id: int, apply: bool) -> dict[str, Any]:
    from superset import db
    from superset.dhis2.staged_dataset_service import get_staged_dataset

    dataset = get_staged_dataset(dataset_id)
    if dataset is None:
        raise ValueError(f"DHIS2StagedDataset id={dataset_id} not found")
    report = {
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "operation": "metadata-only period display repair",
        "applied": apply,
    }
    if not apply:
        return report

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
