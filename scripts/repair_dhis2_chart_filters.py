#!/usr/bin/env python3
"""Repair invalid DHIS2 chart filters and period display ordering.

This utility only changes charts linked to a DHIS2 staged dataset. It converts
saved ``SUM(ou_level)`` adhoc WHERE filters into ordinary ``ou_level`` column
filters. It also removes an invalid raw ``period`` ORDER BY when the raw key
is not a grouped chart dimension, preventing ClickHouse aggregate errors.
Run without ``--apply`` first.
"""

from __future__ import annotations

import argparse
import json
import re
from typing import Any

from superset.app import create_app


_SUM_OU_LEVEL_RE = re.compile(r"^\s*sum\s*\(\s*[`\"]?ou_level[`\"]?\s*\)\s*$", re.I)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Commit repaired chart payloads")
    parser.add_argument(
        "--chart-id",
        action="append",
        type=int,
        dest="chart_ids",
        help="Limit the repair to chart ID(s)",
    )
    return parser.parse_args()


def _loads(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _is_dhis2_chart(chart: Any) -> bool:
    datasource = getattr(chart, "datasource", None)
    extra = _loads(getattr(datasource, "extra", None))
    return bool(
        extra.get("dhis2_staged_dataset_id")
        or extra.get("dhis2_staged_local")
        or getattr(datasource, "schema", None) == "dhis2_serving"
    )


def _repair_filter(item: dict[str, Any]) -> bool:
    candidates = (item.get("subject"), item.get("sqlExpression"), item.get("expression"))
    if not any(isinstance(value, str) and _SUM_OU_LEVEL_RE.match(value) for value in candidates):
        return False
    item["expressionType"] = "SIMPLE"
    item["subject"] = "ou_level"
    item.pop("sqlExpression", None)
    item.pop("expression", None)
    item.setdefault("operator", "==")
    item["clause"] = "WHERE"
    return True


def _repair_payload(node: Any) -> tuple[bool, int, int, int]:
    """Repair filters recursively; return changed/filter/order/time counts."""
    changed = False
    filters_fixed = orders_fixed = time_controls_cleared = 0
    if isinstance(node, list):
        for item in node:
            item_changed, item_filters, item_orders, item_time_controls = _repair_payload(item)
            changed |= item_changed
            filters_fixed += item_filters
            orders_fixed += item_orders
            time_controls_cleared += item_time_controls
        return changed, filters_fixed, orders_fixed, time_controls_cleared
    if not isinstance(node, dict):
        return False, 0, 0, 0

    adhoc_filters = node.get("adhoc_filters")
    if isinstance(adhoc_filters, list):
        for filter_item in adhoc_filters:
            if isinstance(filter_item, dict) and _repair_filter(filter_item):
                changed = True
                filters_fixed += 1

    groupby = node.get("groupby")
    selected_dimensions = groupby if isinstance(groupby, list) else node.get("columns")
    has_raw_period = isinstance(selected_dimensions, list) and "period" in selected_dimensions
    # Preserve period_variant as the selected/displayed dimension, but use the
    # existing display order if a hidden raw key is unavailable. ClickHouse
    # rejects ORDER BY raw period in an aggregate query unless it is grouped.
    orderby = node.get("orderby")
    if isinstance(orderby, list):
        for order_item in orderby:
            if (
                isinstance(order_item, list)
                and order_item
                and order_item[0] == "period"
                and not has_raw_period
            ):
                order_item[0] = "period_variant"
                changed = True
                orders_fixed += 1

    for value in node.values():
        item_changed, item_filters, item_orders, item_time_controls = _repair_payload(value)
        changed |= item_changed
        filters_fixed += item_filters
        orders_fixed += item_orders
        time_controls_cleared += item_time_controls
    return changed, filters_fixed, orders_fixed, time_controls_cleared


def main() -> int:
    args = _parse_args()
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.models.slice import Slice

        query = db.session.query(Slice)
        if args.chart_ids:
            query = query.filter(Slice.id.in_(list(dict.fromkeys(args.chart_ids))))
        changed_charts: list[dict[str, Any]] = []
        for chart in query.all():
            if not _is_dhis2_chart(chart):
                continue
            params = _loads(chart.params)
            query_context = _loads(chart.query_context)
            params_changed, params_filters, params_orders, params_time_controls = _repair_payload(params)
            context_changed, context_filters, context_orders, context_time_controls = _repair_payload(query_context)
            if not (params_changed or context_changed):
                continue
            chart.params = json.dumps(params)
            chart.query_context = json.dumps(query_context)
            changed_charts.append(
                {
                    "chart_id": chart.id,
                    "chart_name": chart.slice_name,
                    "ou_level_filters_fixed": params_filters + context_filters,
                    "period_orders_fixed": params_orders + context_orders,
                    "time_controls_cleared": params_time_controls + context_time_controls,
                }
            )
        if args.apply:
            db.session.commit()
        else:
            db.session.rollback()
        print(json.dumps({"applied": args.apply, "charts": changed_charts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
