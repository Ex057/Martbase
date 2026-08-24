#!/usr/bin/env python3
"""Report malformed DHIS2 chart metrics and period ordering without writes."""

from __future__ import annotations

import argparse
import json
import re
from typing import Any, Iterator

from superset.app import create_app


_AGGREGATE = r"(?:SUM|AVG|COUNT|MIN|MAX|MEDIAN|STDDEV|VARIANCE)"
_WRAPPED_AGGREGATE_RE = re.compile(rf"^\s*{_AGGREGATE}\s*\(", re.IGNORECASE)
_NESTED_AGGREGATE_RE = re.compile(
    rf"\b{_AGGREGATE}\s*\(\s*{_AGGREGATE}\s*\(", re.IGNORECASE
)


def _is_generated_period_expression(expression: Any) -> bool:
    normalized = " ".join(str(expression or "").lower().split())
    return "multiif(" in normalized and "tostring(`period`)" in normalized


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chart-id", action="append", type=int, dest="chart_ids")
    return parser.parse_args()


def _loads(raw: Any, field: str, chart_id: int, errors: list[dict[str, Any]]) -> dict[str, Any]:
    if not isinstance(raw, str) or not raw.strip():
        return {}
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        errors.append(
            {"chart_id": chart_id, "field": field, "error": f"invalid JSON: {exc.msg}"}
        )
        return {}
    if not isinstance(value, dict):
        errors.append(
            {"chart_id": chart_id, "field": field, "error": "JSON root is not an object"}
        )
        return {}
    return value


def _walk(value: Any, path: str = "$") -> Iterator[tuple[str, Any]]:
    yield path, value
    if isinstance(value, dict):
        for key, child in value.items():
            yield from _walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _walk(child, f"{path}[{index}]")


def _metric_findings(payload: dict[str, Any], field: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for path, value in _walk(payload):
        if isinstance(value, str) and _NESTED_AGGREGATE_RE.search(value):
            findings.append(
                {
                    "field": field,
                    "path": path,
                    "kind": "nested_aggregate_metric_string",
                    "value": value,
                }
            )
        if not isinstance(value, dict):
            continue
        if value.get("expressionType") == "SIMPLE":
            column = value.get("column") or {}
            column_name = column.get("column_name") if isinstance(column, dict) else None
            aggregate = value.get("aggregate")
            if aggregate and isinstance(column_name, str) and _WRAPPED_AGGREGATE_RE.match(column_name):
                findings.append(
                    {
                        "field": field,
                        "path": path,
                        "kind": "simple_metric_has_aggregate_column",
                        "value": value,
                        "recommended_column_name": _WRAPPED_AGGREGATE_RE.sub("", column_name, count=1).rsplit(")", 1)[0],
                    }
                )
        sql_expression = value.get("sqlExpression")
        if isinstance(sql_expression, str) and _NESTED_AGGREGATE_RE.search(sql_expression):
            findings.append(
                {
                    "field": field,
                    "path": path,
                    "kind": "nested_aggregate_sql_expression",
                    "value": sql_expression,
                }
            )
    return findings


def _period_order_findings(payload: dict[str, Any], field: str) -> list[dict[str, Any]]:
    findings: list[dict[str, Any]] = []
    for path, value in _walk(payload):
        if not isinstance(value, dict):
            continue
        orderby = value.get("orderby")
        if not isinstance(orderby, list):
            continue
        dimensions = value.get("groupby")
        if not isinstance(dimensions, list):
            dimensions = value.get("columns")
        has_raw_period = isinstance(dimensions, list) and "period" in dimensions
        if has_raw_period:
            continue
        if any(isinstance(item, list) and item and item[0] == "period" for item in orderby):
            findings.append(
                {
                    "field": field,
                    "path": path,
                    "kind": "ungrouped_raw_period_orderby",
                    "value": orderby,
                    "recommended_orderby": [
                        ["period_variant" if item[0] == "period" else item[0], item[1]]
                        if isinstance(item, list) and len(item) >= 2
                        else item
                        for item in orderby
                    ],
                }
            )
    return findings


def _is_dhis2_chart(chart: Any) -> bool:
    datasource = getattr(chart, "datasource", None)
    if getattr(datasource, "schema", None) == "dhis2_serving":
        return True
    try:
        extra = json.loads(getattr(datasource, "extra", None) or "{}")
    except (TypeError, json.JSONDecodeError):
        return False
    return bool(extra.get("dhis2_staged_dataset_id") or extra.get("dhis2_staged_local"))


def main() -> int:
    args = _parse_args()
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.models.slice import Slice

        query = db.session.query(Slice)
        if args.chart_ids:
            query = query.filter(Slice.id.in_(list(dict.fromkeys(args.chart_ids))))
        report: dict[str, Any] = {
            "mode": "read-only",
            "charts": [],
            "dataset_metrics": [],
            "dataset_metadata": [],
            "errors": [],
        }
        audited_datasource_ids: set[int] = set()
        for chart in query.all():
            if not _is_dhis2_chart(chart):
                continue
            errors: list[dict[str, Any]] = report["errors"]
            payloads = {
                "params": _loads(chart.params, "params", chart.id, errors),
                "query_context": _loads(
                    chart.query_context, "query_context", chart.id, errors
                ),
            }
            findings = [
                finding
                for field, payload in payloads.items()
                for finding in (
                    _metric_findings(payload, field) + _period_order_findings(payload, field)
                )
            ]
            if findings:
                report["charts"].append(
                    {
                        "chart_id": chart.id,
                        "chart_name": chart.slice_name,
                        "datasource_id": chart.datasource_id,
                        "datasource_name": getattr(chart.datasource, "table_name", None),
                        "findings": findings,
                    }
                )
            datasource = chart.datasource
            datasource_id = getattr(datasource, "id", None)
            if datasource_id is None or datasource_id in audited_datasource_ids:
                continue
            audited_datasource_ids.add(datasource_id)
            metadata_findings = []
            for column in getattr(datasource, "columns", []) or []:
                column_name = getattr(column, "column_name", None)
                if column_name == "period" and getattr(column, "is_dttm", False):
                    metadata_findings.append(
                        {
                            "column_name": "period",
                            "kind": "raw_period_marked_temporal",
                        }
                    )
                if column_name == "period_variant" and _is_generated_period_expression(
                    getattr(column, "expression", None)
                ):
                    metadata_findings.append(
                        {
                            "column_name": "period_variant",
                            "kind": "generated_period_variant_expression",
                            "expression": column.expression,
                        }
                    )
            if metadata_findings:
                report["dataset_metadata"].append(
                    {
                        "datasource_id": datasource_id,
                        "datasource_name": getattr(datasource, "table_name", None),
                        "findings": metadata_findings,
                    }
                )
            metric_findings = []
            for metric in getattr(datasource, "metrics", []) or []:
                expression = getattr(metric, "expression", None)
                if isinstance(expression, str) and _NESTED_AGGREGATE_RE.search(expression):
                    metric_findings.append(
                        {
                            "metric_name": getattr(metric, "metric_name", None),
                            "expression": expression,
                            "kind": "nested_aggregate_saved_metric",
                        }
                    )
            if metric_findings:
                report["dataset_metrics"].append(
                    {
                        "datasource_id": datasource_id,
                        "datasource_name": getattr(datasource, "table_name", None),
                        "findings": metric_findings,
                    }
                )
        print(json.dumps(report, indent=2, default=str))
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
