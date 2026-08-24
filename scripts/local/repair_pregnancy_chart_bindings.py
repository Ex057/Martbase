#!/usr/bin/env python3
"""Repair pregnancy-chart datasource bindings and remove duplicate query datasources.

Run through ``superset shell`` or as a script with the production Superset
environment loaded. The default is read-only; pass ``--apply`` to commit.
By default it also removes duplicate per-query datasource keys from every
DHIS2-tagged chart; use ``--pregnancy-only`` to limit cleanup to the listed
pregnancy charts.

Example::

    /opt/superset-venv/bin/python scripts/local/repair_pregnancy_chart_bindings.py --apply
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
# Comprehensive list of pregnancy and related null/broken charts confirmed in
# production inspection.
PREGNANCY_CHART_IDS = (
    7,
    15,
    47,
    48,
    49,
    50,
    52,
    86,
    88,
    92,
    93,
    94,
    95,
    96,
    97,
    99,
)
TARGET_DATASET_ID = 360
KNOWN_DHIS2_DATASOURCE_IDS = {
    8,
    11,
    14,
    17,
    20,
    23,
    26,
    34,
    277,
    278,
    358,
    359,
    360,
    365,
    369,
    372,
}


def _load_json(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _is_dhis2_chart(chart: Any) -> bool:
    """Identify tagged, serving-table, and known legacy DHIS2 charts."""
    if getattr(chart, "datasource_id", None) in KNOWN_DHIS2_DATASOURCE_IDS:
        return True
    for raw_payload in (getattr(chart, "params", None), getattr(chart, "query_context", None)):
        payload = _load_json(raw_payload)
        if "dhis2_staged_dataset_id" in payload or "sv_" in str(payload):
            return True
        form_data = payload.get("form_data")
        if isinstance(form_data, dict) and (
            "dhis2_staged_dataset_id" in form_data or "sv_" in str(form_data)
        ):
            return True
    return False


def _remove_nested_query_datasources(query_context: dict[str, Any]) -> bool:
    changed = False
    queries = query_context.get("queries")
    if not isinstance(queries, list):
        return changed
    for query in queries:
        if isinstance(query, dict) and "datasource" in query:
            query.pop("datasource")
            changed = True
    return changed


def _bind_chart_to_dataset(chart: Any, dataset: Any) -> bool:
    changed = False
    datasource_type = str(getattr(dataset, "datasource_type", None) or "table")
    datasource_key = f"{dataset.id}__{datasource_type}"
    dataset_name = str(
        getattr(dataset, "table_name", None) or getattr(dataset, "name", None) or ""
    )

    if getattr(chart, "datasource_id", None) != dataset.id:
        chart.datasource_id = dataset.id
        changed = True
    if getattr(chart, "datasource_type", None) != datasource_type:
        chart.datasource_type = datasource_type
        changed = True
    if getattr(chart, "datasource_name", None) != dataset_name:
        chart.datasource_name = dataset_name
        changed = True

    params = _load_json(getattr(chart, "params", None))
    if params.get("datasource") != datasource_key:
        params["datasource"] = datasource_key
        changed = True
    serialized_params = json.dumps(params)
    if getattr(chart, "params", None) != serialized_params:
        chart.params = serialized_params
        changed = True

    query_context = _load_json(getattr(chart, "query_context", None))
    form_data = query_context.get("form_data")
    if not isinstance(form_data, dict):
        form_data = {}
    if form_data.get("datasource") != datasource_key:
        form_data["datasource"] = datasource_key
        changed = True
    query_context["form_data"] = form_data

    top_level_datasource = query_context.get("datasource")
    if not isinstance(top_level_datasource, dict):
        top_level_datasource = {}
    if top_level_datasource.get("id") != dataset.id:
        top_level_datasource["id"] = dataset.id
        changed = True
    if top_level_datasource.get("type") != datasource_type:
        top_level_datasource["type"] = datasource_type
        changed = True
    query_context["datasource"] = top_level_datasource
    changed = _remove_nested_query_datasources(query_context) or changed

    serialized_context = json.dumps(query_context)
    if getattr(chart, "query_context", None) != serialized_context:
        chart.query_context = serialized_context
        changed = True
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="commit the repair")
    parser.add_argument(
        "--pregnancy-only",
        action="store_true",
        help="do not clean nested query datasources from other tagged DHIS2 charts",
    )
    args = parser.parse_args()

    sys.path.insert(0, str(REPOSITORY_ROOT))
    from superset import db
    from superset.app import create_app
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.slice import Slice

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    os.environ.setdefault("DHIS2_DISABLE_STARTUP_BACKFILL", "true")
    app = create_app()
    with app.app_context():
        target = db.session.get(SqlaTable, TARGET_DATASET_ID)
        if target is None:
            raise RuntimeError(f"Target SqlaTable id={TARGET_DATASET_ID} was not found")

        charts_by_id = {
            chart.id: chart
            for chart in db.session.query(Slice)
            .filter(Slice.id.in_(PREGNANCY_CHART_IDS))
            .all()
        }
        missing_ids = sorted(set(PREGNANCY_CHART_IDS) - set(charts_by_id))
        if missing_ids:
            logging.warning("Pregnancy chart IDs not found: %s", missing_ids)

        changed_ids: set[int] = set()
        for chart in charts_by_id.values():
            if _bind_chart_to_dataset(chart, target):
                changed_ids.add(chart.id)

        if not args.pregnancy_only:
            for chart in db.session.query(Slice).all():
                if chart.id in charts_by_id or not _is_dhis2_chart(chart):
                    continue
                query_context = _load_json(getattr(chart, "query_context", None))
                if _remove_nested_query_datasources(query_context):
                    chart.query_context = json.dumps(query_context)
                    changed_ids.add(chart.id)

        action = "Updated" if args.apply else "Would update"
        logging.info("%s %d chart(s): %s", action, len(changed_ids), sorted(changed_ids))
        if args.apply:
            db.session.commit()
            logging.info("Successfully committed changes to database.")
        else:
            db.session.rollback()
            logging.info("Dry-run complete. Pass --apply to commit changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
