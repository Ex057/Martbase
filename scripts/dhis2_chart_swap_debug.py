"""Diagnose DHIS2 chart save failures for a dataset swap.

Run inside ``superset shell`` on the server:

    exec(open("scripts/dhis2_chart_swap_debug.py").read())

Edit the configuration block below before running.
"""

from __future__ import annotations

import json
from pprint import pprint

from superset import db
from superset.connectors.sqla.models import SqlaTable
from superset.dhis2.superset_dataset_service import normalize_dhis2_chart_payload
from superset.models.slice import Slice


# ---------------------------------------------------------------------------
# Configure these values before running in `superset shell`.
# ---------------------------------------------------------------------------
CHART_NAME = "Pregnant women diagnosed with malaria"
TARGET_SCHEMA = "dhis2_serving"
TARGET_TABLE = "sv_34_mal_preg_dataset_mart"
CHART_ID = None


def _load_chart() -> Slice:
    if CHART_ID is not None:
        chart = db.session.get(Slice, CHART_ID)
        if chart is None:
            raise RuntimeError(f"Chart id={CHART_ID} was not found")
        return chart

    charts = (
        db.session.query(Slice)
        .filter(Slice.slice_name.ilike(f"%{CHART_NAME}%"))
        .order_by(Slice.id.asc())
        .all()
    )
    if not charts:
        raise RuntimeError(f"No chart found matching name: {CHART_NAME!r}")
    if len(charts) > 1:
        print("Multiple charts matched. Set CHART_ID and rerun.")
        for item in charts:
            print(f"  id={item.id} name={item.slice_name}")
        raise SystemExit(1)
    return charts[0]


def _load_dataset() -> SqlaTable:
    dataset = (
        db.session.query(SqlaTable)
        .filter(SqlaTable.schema == TARGET_SCHEMA, SqlaTable.table_name == TARGET_TABLE)
        .one_or_none()
    )
    if dataset is None:
        raise RuntimeError(
            f"Dataset not found: schema={TARGET_SCHEMA!r} table={TARGET_TABLE!r}"
        )
    return dataset


def _json_dict(raw_value: str | None) -> dict:
    if not raw_value:
        return {}
    parsed = json.loads(raw_value)
    return parsed if isinstance(parsed, dict) else {}


def _dataset_label(dataset: SqlaTable) -> str:
    return f"id={dataset.id} datasource={dataset.id}__{dataset.datasource_type} schema={dataset.schema!r} table={dataset.table_name!r} role={getattr(dataset, 'dataset_role', None)!r}"


def _print_summary(chart: Slice, dataset: SqlaTable) -> None:
    print("Chart")
    print(f"  id={chart.id}")
    print(f"  name={chart.slice_name}")
    print(f"  datasource_id={chart.datasource_id}")
    print(f"  datasource_type={chart.datasource_type}")
    print(f"  datasource_name={chart.datasource_name!r}")
    print("")
    print("Current datasource")
    if chart.datasource is not None:
        print(f"  {_dataset_label(chart.datasource)}")
    else:
        print("  None")
    print("")
    print("Target datasource")
    print(f"  {_dataset_label(dataset)}")
    print("")


def _print_reference_slots(label: str, payload: dict) -> None:
    print(label)
    for key in (
        "viz_type",
        "datasource",
        "granularity_sqla",
        "columns",
        "groupby",
        "metrics",
        "metric",
        "secondary_metric",
        "timeseries_limit_metric",
        "x_axis",
        "y_axis",
        "dimension",
        "orderby",
        "filters",
        "adhoc_filters",
        "org_unit_column",
        "staged_legend_column",
        "filter_null_ou_column",
    ):
        if key in payload:
            print(f"  {key}: {payload.get(key)!r}")
    print("")


chart = _load_chart()
target_dataset = _load_dataset()
_print_summary(chart, target_dataset)

current_params = _json_dict(chart.params)
current_query_context = _json_dict(chart.query_context)

_print_reference_slots("Current params reference slots", current_params)
_print_reference_slots(
    "Current query_context.form_data reference slots",
    current_query_context.get("form_data", {})
    if isinstance(current_query_context.get("form_data"), dict)
    else {},
)
queries = current_query_context.get("queries")
if isinstance(queries, list):
    for index, query in enumerate(queries):
        if isinstance(query, dict):
            _print_reference_slots(
                f"Current query_context.queries[{index}] reference slots",
                query,
            )

identity = {}
if hasattr(target_dataset, "get_extra_dict"):
    try:
        extra = target_dataset.get_extra_dict() or {}
    except Exception:  # pylint: disable=broad-except
        extra = {}
    for key in ("dhis2_staged_dataset_id", "dhis2_dataset_role"):
        if key in extra:
            identity[key] = extra[key]

normalized_params, normalized_query_context, unresolved, changed = (
    normalize_dhis2_chart_payload(
        chart.params,
        chart.query_context,
        target_dataset,
        identity=identity or None,
    )
)

print("Normalization result")
print(f"  changed={changed}")
print(f"  unresolved={unresolved}")
print("")

print("Target dataset columns")
print(f"  total={len(target_dataset.column_names or [])}")
print(f"  first_50={list(target_dataset.column_names or [])[:50]}")
print("")

if unresolved:
    print("Unresolved refs were detected after normalization.")
    pprint(unresolved)
else:
    print("No unresolved refs were detected after normalization.")

print("")

normalized_params_dict = _json_dict(normalized_params)
normalized_query_context_dict = _json_dict(normalized_query_context)

_print_reference_slots("Normalized params reference slots", normalized_params_dict)
_print_reference_slots(
    "Normalized query_context.form_data reference slots",
    normalized_query_context_dict.get("form_data", {})
    if isinstance(normalized_query_context_dict.get("form_data"), dict)
    else {},
)
normalized_queries = normalized_query_context_dict.get("queries")
if isinstance(normalized_queries, list):
    for index, query in enumerate(normalized_queries):
        if isinstance(query, dict):
            _print_reference_slots(
                f"Normalized query_context.queries[{index}] reference slots",
                query,
            )

