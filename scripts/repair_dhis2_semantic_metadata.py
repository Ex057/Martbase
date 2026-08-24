#!/usr/bin/env python3
"""Restore DHIS2 semantic column metadata for explicitly selected datasets.

This repairs the Superset metadata that drives Explore's DE, IN, PE and
organisation-unit controls.  It never rebuilds ClickHouse tables, changes
chart bindings, deletes datasets, or guesses metadata from column names.

The target must be a real ``DHIS2StagedDataset``.  An orphaned SqlaTable with
no ``dhis2_staged_dataset_id`` is intentionally refused: map it to its real
staged dataset first, rather than applying potentially incorrect tags.

Examples::

    /opt/superset-venv/bin/python scripts/repair_dhis2_semantic_metadata.py \\
        --dataset-id 39
    /opt/superset-venv/bin/python scripts/repair_dhis2_semantic_metadata.py \\
        --dataset-id 39 --apply
"""

from __future__ import annotations

import argparse
import json
import logging
from collections.abc import Iterable
from typing import Any

from superset.app import create_app


LOGGER = logging.getLogger(__name__)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset-id",
        action="append",
        type=int,
        dest="dataset_ids",
        required=True,
        help="DHIS2 staged dataset ID to repair. May be supplied more than once.",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write the repaired Superset dataset and column metadata.",
    )
    return parser.parse_args()


def _source_instance_ids(dataset_id: int) -> list[int]:
    from superset import db
    from superset.dhis2.models import DHIS2DatasetVariable

    return list(
        dict.fromkeys(
            int(row.instance_id)
            for row in db.session.query(DHIS2DatasetVariable)
            .filter(DHIS2DatasetVariable.staged_dataset_id == dataset_id)
            .all()
            if row.instance_id is not None
        )
    )


def _physical_manifest_columns(dataset: Any, engine: Any) -> list[dict[str, Any]]:
    """Return semantic manifest columns that actually exist in ClickHouse."""
    from superset.dhis2.analytical_serving import (
        _LEGACY_DHIS2_BOUNDARY_LEVEL_BY_COLUMN,
        build_serving_manifest,
    )
    from superset.dhis2.backfill import _supplement_columns_from_physical

    manifest_columns = list(build_serving_manifest(dataset).get("columns") or [])
    physical_names = set(engine.get_serving_table_columns(dataset))
    if physical_names:
        columns = [
            column
            for column in manifest_columns
            if str(column.get("column_name") or "") in physical_names
        ]
    else:
        columns = manifest_columns

    # A dataset created before variable rows existed has only base dimensions
    # in its manifest.  This helper restores DE/IN typing from the cached
    # DHIS2 metadata, but deliberately does not infer types from column names.
    if physical_names and not any(column.get("variable_id") for column in columns):
        columns = _supplement_columns_from_physical(
            columns, physical_names, engine, dataset
        )

    # Older tables can contain the canonical hierarchy columns even when the
    # manifest already contains data-element variables.  In that case the
    # generic supplementation above does not run, leaving national/region/etc.
    # as plain strings.  These names and levels are application-defined
    # canonical fields (not guesses based on a substring), so it is safe to
    # restore their exact hierarchy metadata here.
    by_name = {
        str(column.get("column_name") or ""): column for column in columns
    }
    for column_name, level in _LEGACY_DHIS2_BOUNDARY_LEVEL_BY_COLUMN.items():
        if column_name not in physical_names:
            continue
        column = by_name.setdefault(
            column_name,
            {
                "column_name": column_name,
                "verbose_name": column_name.replace("_", " ").title(),
                "type": "STRING",
                "sql_type": "TEXT",
                "is_dttm": False,
                "is_dimension": True,
            },
        )
        extra = column.get("extra") or {}
        if isinstance(extra, str):
            try:
                extra = json.loads(extra)
            except json.JSONDecodeError:
                extra = {}
        column["extra"] = {
            **(extra if isinstance(extra, dict) else {}),
            "dhis2_is_ou_hierarchy": True,
            "dhis2_ou_level": level,
        }
        if column not in columns:
            columns.append(column)

    if "ou_level" in physical_names:
        column = by_name.setdefault(
            "ou_level",
            {
                "column_name": "ou_level",
                "verbose_name": "OU Level",
                "type": "INTEGER",
                "sql_type": "INTEGER",
                "is_dttm": False,
                "is_dimension": True,
            },
        )
        extra = column.get("extra") or {}
        if isinstance(extra, str):
            try:
                extra = json.loads(extra)
            except json.JSONDecodeError:
                extra = {}
        column["extra"] = {
            **(extra if isinstance(extra, dict) else {}),
            "dhis2_is_ou_level": True,
        }
        if column not in columns:
            columns.append(column)
    return columns


def _semantic_column_counts(columns: Iterable[dict[str, Any]]) -> dict[str, int]:
    counts = {"dataelement": 0, "indicator": 0, "period": 0, "ou": 0}
    for column in columns:
        extra = column.get("extra") or {}
        if isinstance(extra, str):
            try:
                extra = json.loads(extra)
            except json.JSONDecodeError:
                extra = {}
        if not isinstance(extra, dict):
            continue
        variable_type = str(extra.get("dhis2_variable_type") or "").lower()
        if variable_type == "dataelement":
            counts["dataelement"] += 1
        elif variable_type in {"indicator", "programindicator"}:
            counts["indicator"] += 1
        if extra.get("dhis2_is_period"):
            counts["period"] += 1
        if extra.get("dhis2_is_ou_hierarchy") or extra.get("dhis2_is_ou_level"):
            counts["ou"] += 1
    return counts


def _repair_dataset(dataset_id: int, apply: bool) -> dict[str, Any]:
    from superset import db
    from superset.dhis2.analytical_serving import dataset_columns_payload
    from superset.dhis2.models import DHIS2StagedDataset
    from superset.dhis2.staged_dataset_service import get_staged_dataset
    from superset.dhis2.superset_dataset_service import (
        get_clickhouse_serving_database,
        register_metadata_dataset_as_superset_dataset,
        register_serving_table_as_superset_dataset,
        register_specialized_marts_as_superset_datasets,
    )
    from superset.datasets.policy import DatasetRole
    from superset.local_staging.engine_factory import get_active_staging_engine

    dataset = get_staged_dataset(dataset_id)
    if dataset is None:
        raise ValueError(
            f"Staged dataset id={dataset_id} was not found; refusing to tag "
            "an orphaned SqlaTable."
        )
    if not isinstance(dataset, DHIS2StagedDataset):
        raise TypeError(f"Dataset id={dataset_id} is not a DHIS2 staged dataset")

    engine = get_active_staging_engine(dataset.database_id)
    if not engine.serving_table_exists(dataset):
        raise RuntimeError(
            f"Serving table for staged dataset id={dataset.id} ({dataset.name!r}) "
            "does not exist; run an explicit data/build repair first."
        )

    columns = _physical_manifest_columns(dataset, engine)
    serving_columns = dataset_columns_payload(columns)
    source_ref = engine.get_serving_sql_table_ref(dataset)
    instance_ids = _source_instance_ids(dataset.id)
    report = {
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "source_ref": source_ref,
        "physical_column_count": len(columns),
        "semantic_columns": _semantic_column_counts(columns),
        "source_instance_ids": instance_ids,
        "applied": apply,
    }
    if not apply:
        return report

    serving_db = get_clickhouse_serving_database()
    serving_db_id = int(serving_db.id)
    register_serving_table_as_superset_dataset(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        serving_table_ref=source_ref,
        serving_columns=serving_columns,
        serving_database_id=serving_db_id,
        source_database_id=dataset.database_id,
        source_instance_ids=instance_ids,
        dataset_role=DatasetRole.SOURCE.value,
    )
    register_specialized_marts_as_superset_datasets(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        serving_table_ref=source_ref,
        serving_columns=serving_columns,
        serving_database_id=serving_db_id,
        source_database_id=dataset.database_id,
        source_instance_ids=instance_ids,
        engine=engine,
        dataset=dataset,
    )
    metadata_id = register_metadata_dataset_as_superset_dataset(
        dataset_id=dataset.id,
        dataset_name=dataset.name,
        serving_table_ref=source_ref,
        serving_columns=serving_columns,
        source_database_id=dataset.database_id,
        serving_database_id=serving_db_id,
        source_instance_ids=instance_ids,
    )
    if dataset.serving_superset_dataset_id != metadata_id:
        dataset.serving_superset_dataset_id = metadata_id
    db.session.commit()
    report["metadata_dataset_id"] = metadata_id
    return report


def main() -> int:
    args = _parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    app = create_app()
    dataset_ids = list(dict.fromkeys(args.dataset_ids))

    with app.app_context():
        reports: list[dict[str, Any]] = []
        try:
            for dataset_id in dataset_ids:
                report = _repair_dataset(dataset_id, args.apply)
                reports.append(report)
                print(json.dumps(report, indent=2, sort_keys=True))
        except Exception:
            from superset import db

            db.session.rollback()
            LOGGER.exception("Semantic metadata repair failed; transaction rolled back")
            return 1

    if not args.apply:
        print("Dry run only. Re-run with --apply after verifying the report.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
