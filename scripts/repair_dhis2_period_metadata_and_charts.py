#!/usr/bin/env python3
"""Repair categorical DHIS2 period metadata and saved chart time controls.

This is the single operational repair for a period regression: it restores the
``period_variant`` calculated display column on registered datasets, then
removes time-grain controls from DHIS2 charts so compact period keys are never
rendered as epoch timestamps. Run a dry run first; ``--apply`` commits both
SqlaTable and Slice updates in one database transaction.
"""

from __future__ import annotations

import argparse
import json
import runpy
from pathlib import Path

from superset.app import create_app


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    scope = parser.add_mutually_exclusive_group(required=True)
    scope.add_argument("--dataset-id", action="append", type=int, dest="dataset_ids")
    scope.add_argument("--all", action="store_true", help="Repair every staged DHIS2 dataset")
    parser.add_argument("--apply", action="store_true", help="Commit all repairs")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    script_dir = Path(__file__).resolve().parent
    metadata_script = runpy.run_path(
        str(script_dir / "repair_dhis2_period_display_metadata.py")
    )
    chart_script = runpy.run_path(str(script_dir / "repair_dhis2_chart_filters.py"))
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.models.slice import Slice

        target_ids = metadata_script["_target_dataset_ids"](args)
        metadata_updates = sum(
            metadata_script["_repair_sqla_metadata"](dataset_id)
            for dataset_id in target_ids
        )
        changed_charts: list[dict[str, int]] = []
        for chart in db.session.query(Slice).all():
            if not chart_script["_is_dhis2_chart"](chart):
                continue
            params = chart_script["_loads"](chart.params)
            query_context = chart_script["_loads"](chart.query_context)
            params_changed, params_filters, params_orders, params_time = chart_script[
                "_repair_payload"
            ](params)
            context_changed, context_filters, context_orders, context_time = chart_script[
                "_repair_payload"
            ](query_context)
            if not (params_changed or context_changed):
                continue
            chart.params = json.dumps(params)
            chart.query_context = json.dumps(query_context)
            changed_charts.append(
                {
                    "chart_id": chart.id,
                    "ou_level_filters_fixed": params_filters + context_filters,
                    "period_orders_fixed": params_orders + context_orders,
                    "time_controls_cleared": params_time + context_time,
                }
            )

        report = {
            "applied": args.apply,
            "staged_dataset_ids": target_ids,
            "sqla_datasets_updated": metadata_updates,
            "charts_updated": changed_charts,
        }
        if args.apply:
            db.session.commit()
        else:
            db.session.rollback()
        print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
