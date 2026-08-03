# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""
Offline, rule-based SQL generator for the AI SQL assistant.

Produces valid, schema-grounded SQL *deterministically* — no LLM, no API key, and
it can't hallucinate columns because it only ever references columns that exist in
the MART schema context. It mimics the assistant for structured
"metric × period × grouping" questions using the same signals the LLM path gets:
the resolved serving table/schema, the DHIS2 column markers
(``period`` / ``indicator`` / ``agg`` / ``ou_hierarchy``), and the guided
``metric`` / ``period`` inputs.

Identifiers are double-quoted and schema-qualified, which is valid on both serving
backends (DuckDB ``main`` and ClickHouse ``dhis2_serving``); the schema is always
taken from the resolved dataset ref, never hardcoded.
"""
from __future__ import annotations

import re
from typing import Any

# Substrings that mark a SQL type as numeric (safe to aggregate).
_NUMERIC_TYPE_MARKERS = (
    "INT",
    "FLOAT",
    "DOUBLE",
    "DECIMAL",
    "NUMERIC",
    "REAL",
    "NUMBER",
    "BIGINT",
    "SMALLINT",
    "TINYINT",
)


def _quote_ident(name: str) -> str:
    """Double-quote an identifier (works on DuckDB and ClickHouse)."""
    return '"' + str(name).replace('"', '""') + '"'


def _qualified_table(schema: str | None, table: str) -> str:
    return (
        f"{_quote_ident(schema)}.{_quote_ident(table)}"
        if schema
        else _quote_ident(table)
    )


def _is_numeric(col: dict[str, Any]) -> bool:
    col_type = str(col.get("type") or "").upper()
    return any(marker in col_type for marker in _NUMERIC_TYPE_MARKERS)


def _is_aggregatable(col: dict[str, Any]) -> bool:
    """True only for real measures — never a dimension we'd GROUP BY.

    Excludes period and org-unit hierarchy columns (they are text/keys, and
    ``SUM("facility")`` on a string is exactly what triggers the DB 500). A
    column qualifies if it's a flagged indicator/data-element, or numeric.
    """
    markers = _markers(col)
    if markers.get("period") or markers.get("ou_hierarchy"):
        return False
    if markers.get("indicator") or markers.get("agg"):
        return True
    return _is_numeric(col)


def _markers(col: dict[str, Any]) -> dict[str, Any]:
    markers = col.get("dhis2")
    return markers if isinstance(markers, dict) else {}


def _tokenize(text: str) -> set[str]:
    return {tok for tok in re.split(r"[^a-z0-9]+", str(text).lower()) if tok}


def _find_column(columns: list[dict[str, Any]], name: str | None) -> dict[str, Any] | None:
    if not name:
        return None
    target = str(name).strip().lower()
    for col in columns:
        if str(col.get("name") or "").lower() == target:
            return col
    return None


def _pick_period_column(
    entry: dict[str, Any], columns: list[dict[str, Any]]
) -> str | None:
    if entry.get("period_column"):
        return str(entry["period_column"])
    for col in columns:
        if _markers(col).get("period"):
            return str(col.get("name"))
    return None


def _pick_metric_column(
    columns: list[dict[str, Any]],
    metric: str | None,
    question: str,
    period_col: str | None,
) -> dict[str, Any] | None:
    # 1. Explicit metric that actually exists.
    explicit = _find_column(columns, metric)
    if explicit is not None:
        return explicit

    candidates = [
        col
        for col in columns
        if str(col.get("name")) != period_col
        and not _markers(col).get("period")
        and not _markers(col).get("ou_hierarchy")
    ]

    def _is_measure(col: dict[str, Any]) -> bool:
        markers = _markers(col)
        return bool(markers.get("indicator") or markers.get("agg")) or _is_numeric(col)

    # 2. A MEASURE column whose name-tokens appear in the free-text question.
    #    (Restricted to measures so "... by region" doesn't pick the text
    #    dimension "region" as the metric.)
    q_tokens = _tokenize(question)
    if q_tokens:
        for col in candidates:
            if _is_measure(col) and _tokenize(col.get("name") or "") & q_tokens:
                return col

    # 3. First indicator / data-element (has an agg marker) column.
    for col in candidates:
        markers = _markers(col)
        if markers.get("indicator") or markers.get("agg"):
            return col

    # 4. First numeric column.
    for col in candidates:
        if _is_numeric(col):
            return col

    return None


def _pick_dimension_column(
    columns: list[dict[str, Any]],
    period_col: str | None,
    metric_col: str | None,
) -> dict[str, Any] | None:
    # Prefer the most granular org-unit hierarchy column.
    ou_cols = [col for col in columns if _markers(col).get("ou_hierarchy")]
    if ou_cols:
        return max(ou_cols, key=lambda c: int(_markers(c).get("ou_level") or 0))

    # Otherwise the first non-numeric column that isn't the metric/period.
    for col in columns:
        name = str(col.get("name"))
        if name in {period_col, metric_col}:
            continue
        if _markers(col).get("period"):
            continue
        if not _is_numeric(col):
            return col
    return None


def _aggregation_for(metric_col: dict[str, Any]) -> str:
    markers = _markers(metric_col)
    if markers.get("indicator"):
        # Indicators are already-computed rates — averaging is safer than summing.
        return "AVG"
    agg = str(markers.get("agg") or "").upper()
    if agg in {"SUM", "AVG", "MIN", "MAX", "COUNT"}:
        return agg
    return "SUM"


def _period_values(period: str | None) -> list[str]:
    if not period:
        return []
    raw = re.split(r"[,;\s]+", period.strip())
    values: list[str] = []
    for token in raw:
        cleaned = re.sub(r"[^A-Za-z0-9_]", "", token)
        if cleaned:
            values.append(cleaned)
    return values


def _period_clause(period_col: str | None, values: list[str]) -> str:
    if not period_col or not values:
        return ""
    if len(values) == 1:
        return f"\nWHERE {_quote_ident(period_col)} = '{values[0]}'"
    joined = ", ".join(f"'{value}'" for value in values)
    return f"\nWHERE {_quote_ident(period_col)} IN ({joined})"


def _resolve_metric_columns(
    columns: list[dict[str, Any]],
    metrics: list[str] | None,
    metric: str | None,
    question: str,
    period_col: str | None,
) -> list[dict[str, Any]]:
    """Resolve the requested metric(s) to real columns.

    Prefers the explicit ``metrics`` list (then a single ``metric``); if none
    resolve, falls back to inferring one measure column from the question/markers.
    """
    names = [str(name).strip() for name in (metrics or []) if str(name).strip()]
    if metric and metric not in names:
        names.append(metric)

    resolved: list[dict[str, Any]] = []
    seen: set[str] = set()
    for name in names:
        col = _find_column(columns, name)
        # Only keep real measures — silently drop dimension/org-unit columns a
        # user may have picked so we never emit SUM() over a text column.
        if (
            col is not None
            and _is_aggregatable(col)
            and str(col.get("name")) not in seen
        ):
            seen.add(str(col.get("name")))
            resolved.append(col)
    if resolved:
        return resolved

    inferred = _pick_metric_column(columns, metric, question, period_col)
    return [inferred] if inferred is not None else []


def _metric_terms(metric_cols: list[dict[str, Any]]) -> tuple[str, list[str]]:
    """Build the ``SUM("m1") AS …, AVG("m2") AS …`` select list + a summary."""
    terms: list[str] = []
    summary: list[str] = []
    for col in metric_cols:
        name = str(col.get("name"))
        agg = _aggregation_for(col)
        alias = _quote_ident(f"{name}_{agg.lower()}")
        terms.append(f"{agg}({_quote_ident(name)}) AS {alias}")
        summary.append(f"{agg}({name})")
    return ", ".join(terms), summary


def build_local_sql_suggestions(
    database: Any,  # noqa: ARG001 - kept for signature parity with the LLM path
    mart_schema_context: list[dict[str, Any]],
    *,
    question: str = "",
    metric: str | None = None,
    metrics: list[str] | None = None,
    period: str | None = None,
    max_rows: int = 1000,
) -> list[dict[str, Any]]:
    """Build up to ~4 validated-shape SQL suggestions from the schema context.

    Supports one or many ``metrics``. Returns ``[{sql, explanation, assumptions}]``
    (the same shape the LLM path yields); the caller validates them with
    ``ensure_mart_only_sql``.
    """
    if not mart_schema_context:
        return []

    # Pick the target table: prefer one whose name is mentioned in the question.
    entry = mart_schema_context[0]
    q_tokens = _tokenize(question)
    if q_tokens:
        for candidate in mart_schema_context:
            if _tokenize(candidate.get("table") or "") & q_tokens:
                entry = candidate
                break

    columns: list[dict[str, Any]] = entry.get("columns") or []
    if not columns:
        return []

    schema = entry.get("schema")
    table = entry.get("table")
    if not table:
        return []
    from_ref = _qualified_table(schema, table)

    period_col = _pick_period_column(entry, columns)
    metric_cols = _resolve_metric_columns(
        columns, metrics, metric, question, period_col
    )
    first_metric_name = (
        str(metric_cols[0].get("name")) if metric_cols else None
    )
    dimension_col = _pick_dimension_column(columns, period_col, first_metric_name)
    dimension_name = str(dimension_col.get("name")) if dimension_col else None

    # A column can never be both a GROUP BY key and an aggregated metric.
    exclude = {name for name in (dimension_name, period_col) if name}
    metric_cols = [c for c in metric_cols if str(c.get("name")) not in exclude]

    period_values = _period_values(period)
    where_clause = _period_clause(period_col, period_values)
    period_note = f", filtered to period {period}" if period_values else ""
    limit = int(max_rows) if int(max_rows) > 0 else 1000

    suggestions: list[dict[str, Any]] = []

    if metric_cols:
        terms, summary = _metric_terms(metric_cols)
        metric_label = ", ".join(summary)
        # 2nd column is the first metric — used for ordering the ranked variant.
        order_index = 2

        # 1. Metric(s) by dimension (e.g. by district), ranked by the first metric.
        if dimension_name:
            suggestions.append(
                {
                    "sql": (
                        f"SELECT {_quote_ident(dimension_name)}, {terms}\n"
                        f"FROM {from_ref}"
                        f"{where_clause}\n"
                        f"GROUP BY {_quote_ident(dimension_name)}\n"
                        f"ORDER BY {order_index} DESC\n"
                        f"LIMIT {limit}"
                    ),
                    "explanation": (
                        f"{metric_label} by {dimension_name}{period_note}."
                    ),
                    "assumptions": [
                        f"Grouped by {dimension_name}; ranked by the first metric.",
                    ],
                }
            )

        # 2. Metric(s) over time (by period).
        if period_col and period_col != dimension_name:
            suggestions.append(
                {
                    "sql": (
                        f"SELECT {_quote_ident(period_col)}, {terms}\n"
                        f"FROM {from_ref}"
                        f"{where_clause}\n"
                        f"GROUP BY {_quote_ident(period_col)}\n"
                        f"ORDER BY {_quote_ident(period_col)}\n"
                        f"LIMIT {limit}"
                    ),
                    "explanation": f"{metric_label} per {period_col} (time series).",
                    "assumptions": [f"Treated {period_col} as the period dimension."],
                }
            )

        # 3. Metric(s) by dimension AND period (cross-tab source).
        if dimension_name and period_col and period_col != dimension_name:
            suggestions.append(
                {
                    "sql": (
                        f"SELECT {_quote_ident(dimension_name)}, "
                        f"{_quote_ident(period_col)}, {terms}\n"
                        f"FROM {from_ref}"
                        f"{where_clause}\n"
                        f"GROUP BY {_quote_ident(dimension_name)}, "
                        f"{_quote_ident(period_col)}\n"
                        f"ORDER BY {_quote_ident(dimension_name)}, "
                        f"{_quote_ident(period_col)}\n"
                        f"LIMIT {limit}"
                    ),
                    "explanation": (
                        f"{metric_label} by {dimension_name} and {period_col}."
                    ),
                    "assumptions": [
                        f"Grouped by both {dimension_name} and {period_col}.",
                    ],
                }
            )

    # 4. Raw preview (always available) — first handful of columns.
    preview_cols = ", ".join(
        _quote_ident(col.get("name")) for col in columns[:6] if col.get("name")
    )
    if preview_cols:
        suggestions.append(
            {
                "sql": (
                    f"SELECT {preview_cols}\n"
                    f"FROM {from_ref}"
                    f"{where_clause}\n"
                    f"LIMIT 100"
                ),
                "explanation": f"Preview rows from {table}.",
                "assumptions": ["Raw sample of the first columns; no aggregation."],
            }
        )

    return suggestions
