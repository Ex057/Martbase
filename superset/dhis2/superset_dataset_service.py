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
"""Auto-register DHIS2 serving tables as Superset physical (SqlaTable) datasets.

After a serving table is materialized, we register it with Superset's dataset
registry so users can immediately find and chart it without navigating to
Settings > Datasets manually.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from sqlalchemy.exc import IntegrityError
from superset.utils.core import (
    DTTM_ALIAS,
    get_column_names_from_columns,
    get_column_names_from_metrics,
)

logger = logging.getLogger(__name__)


# All DHIS2 staged datasets are served from the ClickHouse serving schema.
# Keeping this explicit on every role (including the user-facing SQL wrapper)
# makes the rows discoverable in Superset's dataset UI and avoids schema-less
# records being treated as legacy logical datasets during a later sync.
DHIS2_SERVING_SCHEMA = "dhis2_serving"

_SIMPLE_METRIC_SQL_RE = re.compile(
    r"^\s*(?P<func>[A-Za-z_][A-Za-z0-9_]*)\s*\(\s*`?(?P<column>[A-Za-z0-9_]+)`?\s*\)\s*$"
)
_DHIS2_CHART_PLACEHOLDER_REFS = frozenset(
    {"__metric__", "true", "params", "query_context"}
)
_DHIS2_SUM_OU_LEVEL_RE = re.compile(
    r'^\s*sum\s*\(\s*[`\"]?ou_level[`\"]?\s*\)\s*$', re.I
)


def get_clickhouse_serving_database(
    preferred_database_id: int | None = None,
    preferred_database: Any | None = None,
) -> Any:
    """Return the ClickHouse Database used for all DHIS2 serving datasets.

    Staged DHIS2 datasets may retain their DHIS2 source database in ``extra``,
    but their SQLA datasource must always execute against ClickHouse.  Never
    use DuckDB, SQLite, or the Superset metadata database as a fallback.
    """
    from superset import db
    from superset.models.core import Database

    preferred = preferred_database
    if preferred is None and isinstance(preferred_database_id, int):
        preferred = db.session.get(Database, preferred_database_id)
    if preferred is not None:
        preferred_uri = str(getattr(preferred, "sqlalchemy_uri", "") or "")
        # ORM test doubles from older call paths do not carry a URI. Real
        # Superset Database rows always do; those must explicitly be ClickHouse.
        if not preferred_uri or "clickhouse" in preferred_uri.lower():
            return preferred

    serving_database = (
        db.session.query(Database)
        .filter(Database.sqlalchemy_uri.ilike("%clickhouse%"))
        .order_by(Database.id.asc())
        .first()
    )
    if serving_database is None:
        raise RuntimeError(
            "No ClickHouse Database is configured for DHIS2 serving datasets"
        )
    return serving_database


def resolve_clickhouse_serving_table_name(table_name: str) -> str:
    """Resolve a friendly DHIS2 name to its physical ClickHouse serving table.

    A MART is preferred when both a base serving table and a MART exist.  The
    function leaves an already physical ``sv_*`` name unchanged.
    """
    normalized_name = str(table_name or "").strip().strip("`\"")
    if not normalized_name or normalized_name.startswith("sv_"):
        return normalized_name

    serving_database = get_clickhouse_serving_database()
    try:
        tables_frame = serving_database.get_df("SHOW TABLES FROM dhis2_serving")
        table_names = [str(value) for value in tables_frame.iloc[:, 0].tolist()]
    except Exception:  # pylint: disable=broad-except
        logger.warning(
            "Unable to resolve ClickHouse serving table for '%s'",
            normalized_name,
            exc_info=True,
        )
        return normalized_name

    suffix = f"_{normalized_name}"
    mart_matches = [
        name for name in table_names if name.startswith("sv_") and name.endswith(f"{suffix}_mart")
    ]
    base_matches = [
        name for name in table_names if name.startswith("sv_") and name.endswith(suffix)
    ]
    matches = mart_matches or base_matches
    return sorted(matches)[0] if matches else normalized_name
_DIRECT_COLUMN_SQL_RE = re.compile(r"^\s*`?(?P<column>[A-Za-z0-9_]+)`?\s*$")


def _normalized_dataset_name(value: Any) -> str:
    return str(value or "").strip().casefold()


def _normalized_sql(value: Any) -> str:
    return " ".join(str(value or "").strip().split()).casefold()


def _normalized_column_ref(value: Any) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().casefold())
    return re.sub(r"_+", "_", normalized).strip("_")


def _column_extra_dict(column: Any) -> dict[str, Any]:
    extra: Any = getattr(column, "extra", None)
    if isinstance(extra, dict):
        return extra
    if isinstance(extra, str):
        try:
            parsed = json.loads(extra)
        except Exception:  # pylint: disable=broad-except
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _build_dhis2_column_rewrite_map(datasource: Any) -> dict[str, str]:
    """Return a best-effort lookup from legacy refs to current column names.

    DHIS2 charts can retain old column labels after a dataset re-registration.
    The live datasource still knows the canonical column names plus stable
    metadata like ``verbose_name`` and ``dhis2_variable_id``.  We use those
    fields to map a stale chart ref to the current datasource column when the
    mapping is unambiguous.
    """

    rewrite_map: dict[str, set[str]] = {}
    current_columns = list(getattr(datasource, "columns", []) or [])
    current_names = {
        str(getattr(column, "column_name", "") or "").strip()
        for column in current_columns
        if str(getattr(column, "column_name", "") or "").strip()
    }

    for column in current_columns:
        column_name = str(getattr(column, "column_name", "") or "").strip()
        if not column_name:
            continue
        extra = _column_extra_dict(column)
        candidates = [
            column_name,
            str(getattr(column, "verbose_name", "") or "").strip(),
            str(extra.get("alias") or "").strip(),
            str(extra.get("dhis2_variable_id") or "").strip(),
        ]
        for candidate in candidates:
            if not candidate:
                continue
            normalized = _normalized_column_ref(candidate)
            if normalized:
                rewrite_map.setdefault(normalized, set()).add(column_name)
            rewrite_map.setdefault(candidate.casefold(), set()).add(column_name)

    resolved: dict[str, str] = {}
    for ref, column_names in rewrite_map.items():
        if len(column_names) == 1:
            resolved[ref] = next(iter(column_names))

    # Prefer exact current names if they are already valid.
    for column_name in current_names:
        resolved[column_name.casefold()] = column_name
        resolved[_normalized_column_ref(column_name)] = column_name

    return resolved


def _rewrite_dhis2_chart_ref(value: Any, rewrite_map: dict[str, str]) -> Any:
    if not isinstance(value, str):
        return value
    normalized = _normalized_column_ref(value)
    candidate = rewrite_map.get(value.casefold()) or rewrite_map.get(normalized)
    if candidate:
        return candidate
    metric_match = _SIMPLE_METRIC_SQL_RE.match(value)
    if metric_match:
        column = metric_match.group("column")
        replacement = rewrite_map.get(column.casefold()) or rewrite_map.get(
            _normalized_column_ref(column)
        )
        if replacement:
            return f"{metric_match.group('func')}({replacement})"
    direct_match = _DIRECT_COLUMN_SQL_RE.match(value)
    if direct_match:
        column = direct_match.group("column")
        replacement = rewrite_map.get(column.casefold()) or rewrite_map.get(
            _normalized_column_ref(column)
        )
        if replacement:
            return replacement
    return value


def _rewrite_dhis2_chart_structure(
    value: Any,
    rewrite_map: dict[str, str],
    *,
    parent_key: str | None = None,
) -> Any:
    scalar_keys = {
        "col",
        "column",
        "column_name",
        "granularity_sqla",
        "metric",
        "secondary_metric",
        "timeseries_limit_metric",
        "org_unit_column",
        "staged_legend_column",
        "filter_null_ou_column",
        "x_axis",
        "y_axis",
        "dimension",
        "sqlExpression",
        "metric_name",
    }
    list_keys = {
        "columns",
        "groupby",
        "metrics",
        "dhis2_hierarchy_columns",
        "matrixify_dimension_columns",
        "matrixify_topn_value_columns",
        "matrixify_topn_order_columns",
        "matrixify_dimension_rows",
        "matrixify_topn_value_rows",
        "matrixify_topn_order_rows",
        "chart_auto_subtitle_metrics",
    }

    if isinstance(value, dict):
        rewritten: dict[str, Any] = {}
        for key, item in value.items():
            if key == "adhoc_filters" and isinstance(item, list):
                rewritten[key] = [
                    _rewrite_dhis2_chart_structure(filter_item, rewrite_map, parent_key=key)
                    for filter_item in item
                ]
                continue
            if key == "filters" and isinstance(item, list):
                rewritten[key] = [
                    _rewrite_dhis2_chart_structure(filter_item, rewrite_map, parent_key=key)
                    for filter_item in item
                ]
                continue
            if key == "orderby" and isinstance(item, list):
                normalized_orderby: list[Any] = []
                for entry in item:
                    if isinstance(entry, (list, tuple)) and entry:
                        entry_list = list(entry)
                        entry_list[0] = _rewrite_dhis2_chart_ref(
                            entry_list[0], rewrite_map
                        )
                        normalized_orderby.append(entry_list)
                    else:
                        normalized_orderby.append(
                            _rewrite_dhis2_chart_structure(
                                entry, rewrite_map, parent_key="orderby"
                            )
                        )
                rewritten[key] = normalized_orderby
                continue
            if key in scalar_keys:
                rewritten[key] = _rewrite_dhis2_chart_ref(item, rewrite_map)
                continue
            if key in list_keys and isinstance(item, list):
                rewritten[key] = [
                    _rewrite_dhis2_chart_structure(
                        element, rewrite_map, parent_key=key
                    )
                    if isinstance(element, (dict, list))
                    else _rewrite_dhis2_chart_ref(element, rewrite_map)
                    for element in item
                ]
                continue
            rewritten[key] = _rewrite_dhis2_chart_structure(
                item, rewrite_map, parent_key=key
            )
        return rewritten

    if isinstance(value, list):
        if parent_key in list_keys:
            return [
                _rewrite_dhis2_chart_structure(item, rewrite_map, parent_key=parent_key)
                if isinstance(item, (dict, list))
                else _rewrite_dhis2_chart_ref(item, rewrite_map)
                for item in value
            ]
        return [
            _rewrite_dhis2_chart_structure(item, rewrite_map, parent_key=parent_key)
            for item in value
        ]

    if parent_key in scalar_keys:
        return _rewrite_dhis2_chart_ref(value, rewrite_map)

    return value


def _repair_chart_query_content(chart: Any, datasource: Any) -> bool:
    params, query_context, _, changed = normalize_dhis2_chart_payload(
        getattr(chart, "params", None),
        getattr(chart, "query_context", None),
        datasource,
    )
    if params is not None:
        setattr(chart, "params", params)
    if query_context is not None:
        setattr(chart, "query_context", query_context)
    return changed


def _normalize_dhis2_dimension_controls(payload: Any) -> bool:
    """Prevent persisted DHIS2 controls from aggregating OU levels or labels."""
    if isinstance(payload, list):
        changed = False
        for item in payload:
            changed = _normalize_dhis2_dimension_controls(item) or changed
        return changed
    if not isinstance(payload, dict):
        return False
    changed = False
    filters = payload.get("adhoc_filters")
    if isinstance(filters, list):
        for filter_item in filters:
            if not isinstance(filter_item, dict):
                continue
            candidates = (
                filter_item.get("subject"),
                filter_item.get("sqlExpression"),
                filter_item.get("expression"),
            )
            if any(
                isinstance(candidate, str)
                and _DHIS2_SUM_OU_LEVEL_RE.match(candidate)
                for candidate in candidates
            ):
                filter_item.update(
                    {"expressionType": "SIMPLE", "subject": "ou_level", "clause": "WHERE"}
                )
                filter_item.pop("sqlExpression", None)
                filter_item.pop("expression", None)
                changed = True
    def uses_dhis2_period(value: Any) -> bool:
        if isinstance(value, str):
            return value in {"period", "period_variant"}
        if isinstance(value, list):
            return any(uses_dhis2_period(item) for item in value)
        return False

    groupby = payload.get("groupby")
    uses_period = any(
        uses_dhis2_period(payload.get(key))
        for key in ("x_axis", "groupby", "columns", "series")
    )
    if uses_period:
        # Compact DHIS2 period codes are categorical keys. Clear time-grain
        # controls before they reach SQLA, otherwise Superset converts them to
        # epoch timestamps for ClickHouse.
        for control in ("granularity_sqla", "time_grain_sqla"):
            if control in payload and payload[control] is not None:
                payload[control] = None
                changed = True
        if payload.get("x_axis") != "period_variant":
            payload["x_axis"] = "period_variant"
            changed = True
    if isinstance(groupby, list) and uses_period:
        normalized_groupby = [
            "period_variant" if item == "period" else item for item in groupby
        ]
        if "period_variant" not in normalized_groupby:
            normalized_groupby.append("period_variant")
        if "period" not in normalized_groupby:
            normalized_groupby.append("period")
        if normalized_groupby != groupby:
            payload["groupby"] = normalized_groupby
            groupby = normalized_groupby
            changed = True
    orderby = payload.get("orderby")
    if isinstance(orderby, list):
        for entry in orderby:
            if isinstance(entry, list) and entry and entry[0] == "period_variant":
                entry[0] = "period"
                changed = True
        if uses_period and not orderby:
            payload["orderby"] = [["period", True]]
            changed = True
    elif uses_period:
        payload["orderby"] = [["period", True]]
        changed = True
    for value in payload.values():
        changed = _normalize_dhis2_dimension_controls(value) or changed
    return changed


def _extract_invalid_metric_ref(value: str, valid_columns: set[str]) -> str | None:
    if _is_dhis2_chart_placeholder_ref(value) or value == DTTM_ALIAS:
        return None
    metric_match = _SIMPLE_METRIC_SQL_RE.match(value)
    if metric_match:
        column = metric_match.group("column")
        return column if column not in valid_columns else None
    direct_match = _DIRECT_COLUMN_SQL_RE.match(value)
    if direct_match:
        column = direct_match.group("column")
        return column if column not in valid_columns else None
    return None


def _extract_invalid_metric_slot_ref(value: str, valid_columns: set[str]) -> str | None:
    if _is_dhis2_chart_placeholder_ref(value) or value == DTTM_ALIAS:
        return None
    metric_match = _SIMPLE_METRIC_SQL_RE.match(value)
    if metric_match:
        column = metric_match.group("column")
        return column if column not in valid_columns else None
    return None


def _extract_invalid_column_ref(value: str, valid_columns: set[str]) -> str | None:
    if _is_dhis2_chart_placeholder_ref(value) or value == DTTM_ALIAS:
        return None
    direct_match = _DIRECT_COLUMN_SQL_RE.match(value)
    if direct_match:
        column = direct_match.group("column")
        return column if column not in valid_columns else None
    return None


def _add_invalid_ref_from_value(
    invalid_refs: set[str],
    value: Any,
    valid_columns: set[str],
    *,
    extractor: Any = _extract_invalid_metric_ref,
) -> None:
    if value in (None, "") or isinstance(value, bool):
        return
    invalid_ref = extractor(str(value), valid_columns)
    if invalid_ref:
        invalid_refs.add(invalid_ref)


def _is_dhis2_chart_placeholder_ref(value: Any) -> bool:
    if isinstance(value, bool):
        return True
    return str(value).strip().lower() in _DHIS2_CHART_PLACEHOLDER_REFS


def _collect_invalid_refs_from_query_dict(
    query_dict: dict[str, Any],
    valid_columns: set[str],
) -> list[str]:
    invalid_refs: set[str] = set()

    columns = query_dict.get("columns") or []
    groupby = query_dict.get("groupby") or []
    metrics = query_dict.get("metrics") or []

    for column in get_column_names_from_columns(columns) + get_column_names_from_columns(
        groupby
    ):
        if (
            not _is_dhis2_chart_placeholder_ref(column)
            and column not in valid_columns
            and column != DTTM_ALIAS
        ):
            invalid_refs.add(column)

    for metric_column in get_column_names_from_metrics(metrics):
        if (
            not _is_dhis2_chart_placeholder_ref(metric_column)
            and metric_column not in valid_columns
            and metric_column != DTTM_ALIAS
        ):
            invalid_refs.add(metric_column)

    for key in (
        "granularity_sqla",
        "x_axis",
        "y_axis",
        "dimension",
        "org_unit_column",
        "staged_legend_column",
        "filter_null_ou_column",
    ):
        if key in query_dict:
            _add_invalid_ref_from_value(
                invalid_refs,
                query_dict.get(key),
                valid_columns,
                extractor=_extract_invalid_column_ref,
            )

    for key in ("metric", "secondary_metric", "timeseries_limit_metric"):
        if key in query_dict:
            _add_invalid_ref_from_value(
                invalid_refs,
                query_dict.get(key),
                valid_columns,
                extractor=_extract_invalid_metric_slot_ref,
            )

    for metric in metrics:
        if isinstance(metric, str):
            _add_invalid_ref_from_value(invalid_refs, metric, valid_columns)
        elif isinstance(metric, dict):
            for key in ("sqlExpression", "metric_name"):
                if key in metric:
                    _add_invalid_ref_from_value(
                        invalid_refs,
                        metric.get(key),
                        valid_columns,
                    )

    for filter_key in ("filters", "adhoc_filters"):
        for filter_item in query_dict.get(filter_key) or []:
            if not isinstance(filter_item, dict):
                continue
            if "col" in filter_item:
                _add_invalid_ref_from_value(
                    invalid_refs,
                    filter_item.get("col"),
                    valid_columns,
                )
            if (
                filter_item.get("expressionType") == "SIMPLE"
                and "subject" in filter_item
            ):
                _add_invalid_ref_from_value(
                    invalid_refs,
                    filter_item.get("subject"),
                    valid_columns,
                )

    for orderby_entry in query_dict.get("orderby") or []:
        if isinstance(orderby_entry, (list, tuple)) and orderby_entry:
            _add_invalid_ref_from_value(invalid_refs, orderby_entry[0], valid_columns)

    return sorted(
        ref for ref in invalid_refs if not _is_dhis2_chart_placeholder_ref(ref)
    )


def collect_dhis2_chart_unresolved_refs(
    params: Any,
    query_context: Any,
    datasource: Any,
) -> dict[str, list[str]]:
    valid_columns = {
        str(column_name).strip()
        for column_name in (getattr(datasource, "column_names", []) or [])
        if str(column_name).strip()
    }
    unresolved: dict[str, list[str]] = {}
    parsed_params = params
    if isinstance(parsed_params, str):
        try:
            parsed_params = json.loads(parsed_params)
        except Exception:  # pylint: disable=broad-except
            parsed_params = None
    if isinstance(parsed_params, dict):
        invalid_refs = _collect_invalid_refs_from_query_dict(parsed_params, valid_columns)
        if invalid_refs:
            unresolved["params"] = invalid_refs

    parsed_query_context = query_context
    if isinstance(parsed_query_context, str):
        try:
            parsed_query_context = json.loads(parsed_query_context)
        except Exception:  # pylint: disable=broad-except
            parsed_query_context = None
    if isinstance(parsed_query_context, dict):
        query_context_refs: set[str] = set()
        form_data = parsed_query_context.get("form_data")
        if isinstance(form_data, dict):
            query_context_refs.update(
                _collect_invalid_refs_from_query_dict(form_data, valid_columns)
            )
        for query in parsed_query_context.get("queries") or []:
            if isinstance(query, dict):
                query_context_refs.update(
                    _collect_invalid_refs_from_query_dict(query, valid_columns)
                )
        if query_context_refs:
            unresolved["query_context"] = sorted(query_context_refs)
    return unresolved


def normalize_dhis2_chart_payload(
    params: Any,
    query_context: Any,
    datasource: Any,
    *,
    identity: dict[str, Any] | None = None,
) -> tuple[str | None, str | None, dict[str, list[str]], bool]:
    rewrite_map = _build_dhis2_column_rewrite_map(datasource)
    changed = False
    normalized_params: str | None = params
    normalized_query_context: str | None = query_context
    datasource_type = getattr(datasource, "datasource_type", "table")
    datasource_key = f"{datasource.id}__{datasource_type}"

    parsed_params = None
    if params:
        try:
            parsed_params = json.loads(params) if isinstance(params, str) else params
        except Exception:  # pylint: disable=broad-except
            parsed_params = None
        if isinstance(parsed_params, dict):
            if identity:
                parsed_params.update(identity)
            parsed_params["datasource"] = datasource_key
            rewritten = _rewrite_dhis2_chart_structure(parsed_params, rewrite_map)
            _normalize_dhis2_dimension_controls(rewritten)
            normalized_params = json.dumps(rewritten)
            changed = changed or rewritten != parsed_params or normalized_params != params
            parsed_params = rewritten

    parsed_query_context = None
    if query_context:
        try:
            parsed_query_context = (
                json.loads(query_context)
                if isinstance(query_context, str)
                else query_context
            )
        except Exception:  # pylint: disable=broad-except
            parsed_query_context = None
        if isinstance(parsed_query_context, dict):
            form_data = parsed_query_context.get("form_data")
            if not isinstance(form_data, dict):
                form_data = {}
            if identity:
                form_data.update(identity)
            form_data["datasource"] = datasource_key
            parsed_query_context["form_data"] = form_data

            query_context_datasource = parsed_query_context.get("datasource")
            if not isinstance(query_context_datasource, dict):
                query_context_datasource = {}
            if identity:
                query_context_datasource.update(identity)
            query_context_datasource["id"] = datasource.id
            query_context_datasource["type"] = datasource_type
            parsed_query_context["datasource"] = query_context_datasource

            queries = parsed_query_context.get("queries")
            if isinstance(queries, list):
                for query_item in queries:
                    if not isinstance(query_item, dict):
                        continue
                    # QueryObjectFactory receives the context datasource as a
                    # dedicated argument. Passing an additional datasource in
                    # each query dict expands it twice and raises
                    # ``create() got multiple values for keyword argument
                    # 'datasource'``. DHIS2 chart contexts therefore keep the
                    # datasource only at the top level.
                    query_item.pop("datasource", None)

            rewritten = _rewrite_dhis2_chart_structure(parsed_query_context, rewrite_map)
            _normalize_dhis2_dimension_controls(rewritten)
            normalized_query_context = json.dumps(rewritten)
            changed = changed or rewritten != parsed_query_context or normalized_query_context != query_context
            parsed_query_context = rewritten

    unresolved = collect_dhis2_chart_unresolved_refs(
        parsed_params if isinstance(parsed_params, dict) else normalized_params,
        parsed_query_context
        if isinstance(parsed_query_context, dict)
        else normalized_query_context,
        datasource,
    )
    return normalized_params, normalized_query_context, unresolved, changed


def _is_metadata_wrapper_candidate(
    candidate: Any,
    *,
    source_database_id: int,
    serving_table_ref: str,
) -> bool:
    try:
        extra = json.loads(getattr(candidate, "extra", None) or "{}")
    except Exception:  # pylint: disable=broad-except
        extra = {}

    if getattr(candidate, "database_id", None) != source_database_id:
        return False
    if getattr(candidate, "schema", None) != DHIS2_SERVING_SCHEMA:
        return False
    if not getattr(candidate, "sql", None):
        return False

    expected_sql = _normalized_sql(_build_metadata_wrapper_sql(serving_table_ref))
    candidate_sql = _normalized_sql(getattr(candidate, "sql", None))
    candidate_serving_ref = str(extra.get("dhis2_serving_table_ref") or "").strip()
    return candidate_sql == expected_sql or candidate_serving_ref == serving_table_ref


def _parse_table_ref(table_ref: str) -> tuple[str | None, str]:
    """Split ``schema.table_name`` or bare ``table_name`` into parts.

    Strips both double-quote and backtick delimiters so that ClickHouse
    table refs like ``\`dhis2_serving\`.\`sv_1_foo\``` are parsed cleanly
    into (``dhis2_serving``, ``sv_1_foo``) without stray backtick characters
    ending up inside the generated table names.
    """
    if "." in table_ref:
        schema, table_name = table_ref.split(".", 1)
        schema = schema.strip('"').strip("`")
        table_name = table_name.strip('"').strip("`")
        return schema, table_name
    return None, table_ref.strip('"').strip("`")


def _build_metadata_wrapper_sql(serving_table_ref: str) -> str:
    """Build the wrapper ``SELECT`` with consistently backtick-quoted identifiers.

    The generated SQL is executed through the DHIS2 staged-local dialect, which
    routes ``SELECT * FROM `schema`.`table``` to the ClickHouse serving
    database.  If the identifiers are left *unquoted* (``schema.table``) the
    dialect instead parses the schema as an API endpoint and 404s — so a
    wrapper built from an unquoted ``serving_table_ref`` silently fails to load
    any data.  Historically the SQL was string-interpolated from the raw
    ``serving_table_ref`` whose quoting depended on the caller, which produced
    both working (quoted) and broken (unquoted) wrappers.  Normalising here via
    :func:`_parse_table_ref` makes the wrapper SQL deterministic regardless of
    how the caller quoted the reference.
    """
    schema, table_name = _parse_table_ref(serving_table_ref)
    if schema:
        return f"SELECT * FROM `{schema}`.`{table_name}`"
    return f"SELECT * FROM `{table_name}`"


def _get_staged_local_candidates(dataset_id: int, database_id: int | None = None) -> list[Any]:
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    query = db.session.query(SqlaTable).filter(
        SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
        | SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%')
    )
    if database_id is not None:
        query = query.filter(SqlaTable.database_id == database_id)
    return query.all()


def _get_dhis2_sqla_table(
    dataset_id: int,
    dataset_role: str | None = None,
    *,
    ensure_registered: bool = False,
) -> Any | None:
    """Resolve a DHIS2 SqlaTable, optionally repairing missing registrations.

    The default remains a pure metadata lookup.  Callers that explicitly need
    recovery can opt in once the durable staged dataset is known to exist;
    this deliberately avoids triggering serving-table work from normal chart
    reads and repair scans.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    def _lookup() -> list[Any]:
        query = db.session.query(SqlaTable).filter(
            SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
            | SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%')
        )
        if dataset_role:
            query = query.filter(SqlaTable.dataset_role == dataset_role)
        return query.all()

    candidates = _lookup()
    if not candidates and ensure_registered:
        from superset.dhis2.models import DHIS2StagedDataset
        from superset.dhis2.staged_dataset_service import ensure_serving_table

        if db.session.get(DHIS2StagedDataset, dataset_id) is not None:
            ensure_serving_table(dataset_id)
            candidates = _lookup()
    if not candidates:
        return None

    def _candidate_score(candidate: Any) -> tuple[int, int, int]:
        try:
            extra = json.loads(getattr(candidate, "extra", None) or "{}")
        except Exception:  # pylint: disable=broad-except
            extra = {}
        candidate_role = str(getattr(candidate, "dataset_role", "") or "").strip()
        role_score = 0 if dataset_role and candidate_role == dataset_role else 1
        ref_score = 0 if str(extra.get("dhis2_serving_table_ref") or "").strip() else 1
        return role_score, ref_score, int(getattr(candidate, "id", 0) or 0)

    candidates.sort(key=_candidate_score)
    return candidates[0]


def _get_dhis2_staged_dataset_id_from_extra(datasource: Any) -> int | None:
    try:
        extra = json.loads(getattr(datasource, "extra", None) or "{}")
    except Exception:  # pylint: disable=broad-except
        extra = {}
    staged_dataset_id = extra.get("dhis2_staged_dataset_id")
    return staged_dataset_id if isinstance(staged_dataset_id, int) else None


def _get_chart_repair_identity(dataset_id: int, dataset_role: str | None) -> dict[str, Any]:
    identity: dict[str, Any] = {"dhis2_staged_dataset_id": dataset_id}
    if dataset_role:
        identity["dhis2_dataset_role"] = dataset_role
    return identity


def _get_chart_name_for_logging(chart: Any) -> str:
    return str(
        getattr(chart, "slice_name", None)
        or getattr(chart, "name", None)
        or ""
    ).strip()


def repair_charts_for_dhis2_staged_dataset(
    dataset_id: int,
    dataset_role: str | None = None,
) -> int:
    """Repair chart metadata for a re-registered DHIS2 staged dataset."""
    from superset import db
    from superset.models.slice import Slice

    datasource = _get_dhis2_sqla_table(dataset_id, dataset_role)
    if datasource is None:
        return 0

    staged_patterns = [
        f'%"dhis2_staged_dataset_id": {dataset_id}%',
        f'%"dhis2_staged_dataset_id":{dataset_id}%',
    ]
    query = db.session.query(Slice).filter(
        Slice.params.like(staged_patterns[0])
        | Slice.params.like(staged_patterns[1])
        | Slice.query_context.like(staged_patterns[0])
        | Slice.query_context.like(staged_patterns[1])
    )
    if dataset_role:
        role_patterns = [
            f'%"dhis2_dataset_role": "{dataset_role}"%',
            f'%"dhis2_dataset_role":"{dataset_role}"%',
        ]
        query = query.filter(
            Slice.params.like(role_patterns[0])
            | Slice.params.like(role_patterns[1])
            | Slice.query_context.like(role_patterns[0])
            | Slice.query_context.like(role_patterns[1])
        )

    repaired = 0
    for chart in query.all():
        changed = False
        identity = _get_chart_repair_identity(dataset_id, dataset_role)

        params, query_context, unresolved_refs, payload_changed = (
            normalize_dhis2_chart_payload(
                chart.params,
                chart.query_context,
                datasource,
                identity=identity,
            )
        )

        chart.params = params
        chart.query_context = query_context
        changed = changed or payload_changed

        if chart.datasource_id != datasource.id:
            chart.datasource_id = datasource.id
            changed = True
        if chart.datasource_type != datasource.datasource_type:
            chart.datasource_type = datasource.datasource_type
            changed = True
        if getattr(chart, "datasource_name", None) != getattr(datasource, "name", None):
            chart.datasource_name = getattr(datasource, "name", None)
            changed = True

        if unresolved_refs:
            logger.warning(
                "repair_charts_for_dhis2_staged_dataset: unresolved refs remain for chart id=%s dataset id=%s role=%s refs=%s",
                getattr(chart, "id", None),
                dataset_id,
                dataset_role,
                unresolved_refs,
            )

        if changed:
            repaired += 1

    if repaired:
        db.session.commit()
        logger.info(
            "repair_charts_for_dhis2_staged_dataset: repaired %s charts for dataset id=%s role=%s",
            repaired,
            dataset_id,
            dataset_role,
        )
    return repaired


def repair_chart_bindings_for_dhis2_staged_dataset(dataset_id: int) -> int:
    """Repair staged-dataset charts without rebinding valid MART/METADATA charts.

    Preserve the chart's current eligible role when possible. Only charts
    bound to a missing/ineligible datasource are rebound, preferring MART and
    then falling back to METADATA.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.datasets.policy import DatasetRole
    from superset.models.slice import Slice

    eligible_targets = {
        DatasetRole.MART.value: _get_dhis2_sqla_table(dataset_id, DatasetRole.MART.value),
        DatasetRole.METADATA.value: _get_dhis2_sqla_table(
            dataset_id,
            DatasetRole.METADATA.value,
        ),
    }
    eligible_targets = {
        role: datasource
        for role, datasource in eligible_targets.items()
        if datasource is not None
    }
    if not eligible_targets:
        logger.warning(
            "repair_chart_bindings_for_dhis2_staged_dataset: no eligible target for dataset id=%s; retaining existing chart bindings",
            dataset_id,
        )
        return 0

    staged_patterns = [
        f'%"dhis2_staged_dataset_id": {dataset_id}%',
        f'%"dhis2_staged_dataset_id":{dataset_id}%',
    ]
    query = db.session.query(Slice).filter(
        Slice.params.like(staged_patterns[0])
        | Slice.params.like(staged_patterns[1])
        | Slice.query_context.like(staged_patterns[0])
        | Slice.query_context.like(staged_patterns[1])
    )

    repaired = 0
    for chart in query.all():
        changed = False
        previous_datasource_id = getattr(chart, "datasource_id", None)
        previous_role = None
        current_datasource = None
        if previous_datasource_id is not None:
            current_datasource = db.session.get(SqlaTable, previous_datasource_id)
        if (
            current_datasource is not None
            and _get_dhis2_staged_dataset_id_from_extra(current_datasource) == dataset_id
        ):
            current_role = str(getattr(current_datasource, "dataset_role", "") or "").strip()
            if current_role in eligible_targets:
                previous_role = current_role

        target_role = previous_role or next(
            (
                role
                for role in (DatasetRole.MART.value, DatasetRole.METADATA.value)
                if role in eligible_targets
            ),
            None,
        )
        if target_role is None:
            continue
        datasource = eligible_targets[target_role]
        identity = _get_chart_repair_identity(dataset_id, target_role)

        params, query_context, unresolved_refs, payload_changed = (
            normalize_dhis2_chart_payload(
                chart.params,
                chart.query_context,
                datasource,
                identity=identity,
            )
        )

        # A candidate datasource that cannot satisfy the chart's saved column
        # references is not a safe repair target. Do not update either the
        # serialized state or the datasource binding: doing so would turn a
        # recoverable drifted chart into an unrelated chart during scheduled
        # synchronization.
        if unresolved_refs:
            logger.warning(
                "repair_chart_bindings_for_dhis2_staged_dataset: aborting chart repair for unresolved refs chart id=%s name=%s dataset id=%s old_role=%s proposed_role=%s refs=%s",
                getattr(chart, "id", None),
                _get_chart_name_for_logging(chart),
                dataset_id,
                previous_role,
                target_role,
                unresolved_refs,
            )
            continue

        chart.params = params
        chart.query_context = query_context
        changed = changed or payload_changed

        if chart.datasource_id != datasource.id:
            chart.datasource_id = datasource.id
            changed = True
        if chart.datasource_type != datasource.datasource_type:
            chart.datasource_type = datasource.datasource_type
            changed = True
        if getattr(chart, "datasource_name", None) != getattr(datasource, "name", None):
            chart.datasource_name = getattr(datasource, "name", None)
            changed = True

        if changed:
            repaired += 1
            logger.info(
                "repair_chart_bindings_for_dhis2_staged_dataset: repaired chart id=%s name=%s dataset id=%s old_datasource_id=%s old_role=%s new_datasource_id=%s new_role=%s",
                getattr(chart, "id", None),
                _get_chart_name_for_logging(chart),
                dataset_id,
                previous_datasource_id,
                previous_role,
                getattr(datasource, "id", None),
                target_role,
            )

    if repaired:
        db.session.commit()
        logger.info(
            "repair_chart_bindings_for_dhis2_staged_dataset: repaired %s charts for dataset id=%s",
            repaired,
            dataset_id,
        )
    return repaired


def register_metadata_dataset_as_superset_dataset(
    dataset_id: int,
    dataset_name: str,
    serving_table_ref: str,
    serving_columns: list[dict[str, Any]],
    source_database_id: int,
    *,
    serving_database_id: int | None = None,
    source_instance_ids: list[int] | None = None,
) -> int:
    """Create or update the user-facing staged-local virtual METADATA dataset.

    This dataset lives on the logical DHIS2 Database so it appears in Dataset
    Management, while query execution is still routed to the serving database
    through the staged-local metadata stored in ``extra``.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.datasets.policy import DatasetRole
    from superset.models.core import Database

    source_db = db.session.get(Database, source_database_id)
    if source_db is None:
        raise ValueError(f"Source database id={source_database_id} not found")

    # A METADATA wrapper is user-facing but always executes its virtual SQL on
    # ClickHouse.  Do not fall back to its DHIS2 source, DuckDB, or SQLite.
    serving_db = get_clickhouse_serving_database(serving_database_id)
    effective_database_id = serving_db.id
    effective_database = serving_db

    metadata_sql = _build_metadata_wrapper_sql(serving_table_ref)

    existing = None
    stale_metadata_records: list[Any] = []
    candidates = _get_staged_local_candidates(dataset_id)
    metadata_candidates: list[Any] = []
    for candidate in candidates:
        if getattr(candidate, "dataset_role", None) == DatasetRole.METADATA.value or _is_metadata_wrapper_candidate(
            candidate,
            source_database_id=effective_database_id,
            serving_table_ref=serving_table_ref,
        ):
            metadata_candidates.append(candidate)

    if metadata_candidates:
        normalized_target = _normalized_dataset_name(dataset_name)
        metadata_candidates.sort(
            key=lambda candidate: (
                0
                if getattr(candidate, "database_id", None) == effective_database_id
                else 1,
                0
                if _is_metadata_wrapper_candidate(
                    candidate,
                    source_database_id=effective_database_id,
                    serving_table_ref=serving_table_ref,
                )
                else 1,
                0
                if str(getattr(candidate, "table_name", "") or "") == dataset_name
                else 1
                if _normalized_dataset_name(getattr(candidate, "table_name", None))
                == normalized_target
                else 2
                if getattr(candidate, "dataset_role", None) == DatasetRole.METADATA.value
                else 3,
                int(getattr(candidate, "id", 0) or 0),
            )
        )
        existing = metadata_candidates[0]
        stale_metadata_records.extend(metadata_candidates[1:])

    if existing is None:
        logical_candidates = (
            db.session.query(SqlaTable)
            .filter(
                SqlaTable.database_id == effective_database_id,
                SqlaTable.schema == DHIS2_SERVING_SCHEMA,
            )
            .all()
        )
        normalized_target = _normalized_dataset_name(dataset_name)
        matching_candidates = [
            candidate
            for candidate in logical_candidates
            if _normalized_dataset_name(getattr(candidate, "table_name", None))
            == normalized_target
        ]
        if matching_candidates:
            matching_candidates.sort(
                key=lambda candidate: (
                    0
                    if str(getattr(candidate, "table_name", "") or "") == dataset_name
                    else 1,
                    int(getattr(candidate, "id", 0) or 0),
                )
            )
            existing = matching_candidates[0]
            stale_metadata_records.extend(matching_candidates[1:])

    if existing is not None and stale_metadata_records:
        for stale in stale_metadata_records:
            if stale.id != existing.id and not _has_dhis2_persistence_lock(stale):
                logger.info(
                    "superset_dataset_service: removing stale DHIS2 metadata dataset id=%d ('%s')",
                    stale.id,
                    stale.table_name,
                )
                db.session.delete(stale)

    if existing is not None:
        if existing.database_id != effective_database_id:
            existing.database_id = effective_database_id
            existing.database = effective_database
        if existing.schema != DHIS2_SERVING_SCHEMA:
            existing.schema = DHIS2_SERVING_SCHEMA
        if existing.table_name != dataset_name:
            existing.table_name = dataset_name
        if existing.sql != metadata_sql:
            existing.sql = metadata_sql
        if not existing.is_sqllab_view:
            existing.is_sqllab_view = True
        if existing.is_managed_externally:
            existing.is_managed_externally = False
        existing.dataset_role = DatasetRole.METADATA.value
        _ensure_dhis2_extra(
            existing,
            dataset_id,
            dataset_display_name=dataset_name,
            source_database_id=source_database_id,
            source_database_name=source_db.database_name,
            source_instance_ids=source_instance_ids,
            serving_database_id=getattr(serving_db, "id", None),
            serving_database_name=getattr(serving_db, "database_name", None),
            serving_table_ref=serving_table_ref,
        )
        with db.session.no_autoflush:
            _sync_columns(existing, serving_columns)
        db.session.commit()
        logger.info(
            "superset_dataset_service: updated metadata SqlaTable id=%d for '%s'",
            existing.id,
            dataset_name,
        )
        return existing.id

    initial_extra: dict[str, Any] = {
        "dhis2_staged_dataset_id": dataset_id,
        "dhis2_staged_local": True,
        "dhis2_role": _resolve_dhis2_swapper_role(
            DatasetRole.METADATA.value, dataset_name
        ),
        "dhis2_serving": True,
        "dhis2_dataset_display_name": dataset_name,
        "dhis2_source_database_id": source_database_id,
        "dhis2_source_database_name": source_db.database_name,
        "dhis2_serving_table_ref": serving_table_ref,
    }
    if source_instance_ids:
        initial_extra["dhis2_source_instance_ids"] = source_instance_ids
    if serving_db is not None:
        initial_extra["dhis2_serving_database_id"] = serving_db.id
        initial_extra["dhis2_serving_database_name"] = serving_db.database_name

    sqla_table = SqlaTable(
        table_name=dataset_name,
        schema=DHIS2_SERVING_SCHEMA,
        sql=metadata_sql,
        database_id=effective_database_id,
        database=effective_database,
        is_sqllab_view=True,
        is_managed_externally=False,
        extra=json.dumps(initial_extra),
        dataset_role=DatasetRole.METADATA.value,
    )
    _sync_columns(sqla_table, serving_columns)

    with db.session.no_autoflush:
        db.session.add(sqla_table)
        try:
            db.session.flush()
        except IntegrityError:
            db.session.rollback()
            existing = None
            normalized_target = _normalized_dataset_name(dataset_name)
            retry_candidates = (
                db.session.query(SqlaTable)
                .filter(SqlaTable.schema == DHIS2_SERVING_SCHEMA)
                .all()
            )
            matching_candidates = [
                candidate
                for candidate in retry_candidates
                if (
                    _normalized_dataset_name(getattr(candidate, "table_name", None))
                    == normalized_target
                    and (
                        getattr(candidate, "dataset_role", None)
                        == DatasetRole.METADATA.value
                        or _is_metadata_wrapper_candidate(
                            candidate,
                            source_database_id=effective_database_id,
                            serving_table_ref=serving_table_ref,
                        )
                    )
                )
                or _is_metadata_wrapper_candidate(
                    candidate,
                    source_database_id=effective_database_id,
                    serving_table_ref=serving_table_ref,
                )
            ]
            if matching_candidates:
                matching_candidates.sort(
                    key=lambda candidate: (
                        0
                        if getattr(candidate, "database_id", None)
                        == effective_database_id
                        else 1,
                        0
                        if str(getattr(candidate, "table_name", "") or "") == dataset_name
                        else 1
                        if _normalized_dataset_name(
                            getattr(candidate, "table_name", None)
                        )
                        == normalized_target
                        else 2,
                        int(getattr(candidate, "id", 0) or 0),
                    )
                )
                existing = matching_candidates[0]
                for stale in matching_candidates[1:]:
                    if stale.id != existing.id and not _has_dhis2_persistence_lock(stale):
                        db.session.delete(stale)
                existing.table_name = dataset_name
                existing.schema = DHIS2_SERVING_SCHEMA
                existing.sql = metadata_sql
                existing.database_id = effective_database_id
                existing.database = effective_database
                existing.is_sqllab_view = True
                existing.is_managed_externally = False
                existing.dataset_role = DatasetRole.METADATA.value
                _ensure_dhis2_extra(
                    existing,
                    dataset_id,
                    dataset_display_name=dataset_name,
                    source_database_id=source_database_id,
                    source_database_name=source_db.database_name,
                    source_instance_ids=source_instance_ids,
                    serving_database_id=getattr(serving_db, "id", None),
                    serving_database_name=getattr(serving_db, "database_name", None),
                    serving_table_ref=serving_table_ref,
                )
                _sync_columns(existing, serving_columns)
                db.session.commit()
                logger.info(
                    "superset_dataset_service: resolved metadata race-condition; using existing SqlaTable id=%d for '%s'",
                    existing.id,
                    dataset_name,
                )
                return existing.id
            raise

    db.session.commit()
    logger.info(
        "superset_dataset_service: registered new metadata SqlaTable id=%d name='%s' for DHIS2 dataset_id=%d",
        sqla_table.id,
        dataset_name,
        dataset_id,
    )
    return sqla_table.id


def register_serving_table_as_superset_dataset(
    dataset_id: int,
    dataset_name: str,
    serving_table_ref: str,
    serving_columns: list[dict[str, Any]],
    serving_database_id: int,
    *,
    source_database_id: int | None = None,
    source_instance_ids: list[int] | None = None,
    dataset_role: str | None = None,
) -> int:
    """Create or update a Superset SqlaTable for the DHIS2 serving table.

    Parameters
    ----------
    dataset_id:
        The ``DHIS2StagedDataset.id`` — stored in the ``extra`` JSON of the
        SqlaTable so we can find it later.
    dataset_name:
        Human-readable name for the staged dataset.
    serving_table_ref:
        Schema-qualified table reference, e.g. ``dhis2_staging.sv_1_malaria``.
    serving_columns:
        Column definitions from ``build_serving_manifest()["columns"]``.
    serving_database_id:
        The Superset ``Database.id`` that owns the staging schema.
    source_database_id:
        The Superset ``Database.id`` of the originating DHIS2 connection.
        Stored in ``extra`` so the DHIS2Map can route geo/metadata requests
        to the correct DHIS2 database instead of the local serving database.
    source_instance_ids:
        DHIS2 instance PKs associated with this dataset.  Stored in ``extra``
        so the map can request instance-specific metadata.

    Returns
    -------
    int
        The ``SqlaTable.id`` of the created or updated physical dataset.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.datasets.policy import DatasetRole
    from superset.models.core import Database

    ref_schema, table_name = _parse_table_ref(serving_table_ref)
    resolved_table_name = resolve_clickhouse_serving_table_name(table_name)
    if resolved_table_name != table_name:
        serving_table_ref = _format_sql_table_ref(
            ref_schema or DHIS2_SERVING_SCHEMA,
            resolved_table_name,
        )
        table_name = resolved_table_name
    schema = DHIS2_SERVING_SCHEMA
    effective_dataset_role = dataset_role or DatasetRole.SOURCE.value

    # All physical DHIS2 datasource rows must point to ClickHouse, even if a
    # stale caller supplied the previous DuckDB/SQLite database ID.
    serving_db = get_clickhouse_serving_database(serving_database_id)
    serving_database_id = serving_db.id

    # --- Priority 1: find any SqlaTable on this database that already carries
    # dhis2_staged_dataset_id in its extra JSON. We match the current
    # dhis2_serving_table_ref first because the staged dataset can have both a
    # SOURCE and a MART physical dataset at the same time. ---
    with db.session.no_autoflush:
        all_candidates = (
            db.session.query(SqlaTable)
            .filter(
                SqlaTable.database_id == serving_database_id,
                SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%'),
            )
            .all()
        )
        # Also accept the variant without space after colon
        if not all_candidates:
            all_candidates = (
                db.session.query(SqlaTable)
                .filter(
                    SqlaTable.database_id == serving_database_id,
                    SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%'),
                )
                .all()
            )

    existing = None
    stale_sv_records: list[Any] = []
    legacy_wrapper_candidates: list[Any] = []
    same_role_stale_records: list[Any] = []
    if all_candidates:
        for c in all_candidates:
            extra = json.loads(c.extra or "{}") if c.extra else {}
            candidate_serving_ref = str(extra.get("dhis2_serving_table_ref") or "").strip()
            matches_current_ref = candidate_serving_ref == serving_table_ref
            matches_current_physical_name = c.schema == schema and c.table_name == table_name
            candidate_role = getattr(c, "dataset_role", None)
            candidate_is_metadata = candidate_role == DatasetRole.METADATA.value
            candidate_is_mart = candidate_role == DatasetRole.MART.value
            if effective_dataset_role == DatasetRole.MART.value:
                if candidate_is_metadata:
                    continue
                if not candidate_is_mart and candidate_role not in (None, ""):
                    continue
            else:
                if candidate_is_metadata or candidate_is_mart:
                    continue
            if matches_current_ref or matches_current_physical_name:
                if existing is None:
                    existing = c
                else:
                    stale_sv_records.append(c)
            elif (
                effective_dataset_role == DatasetRole.MART.value
                and candidate_is_mart
            ) or (
                effective_dataset_role != DatasetRole.MART.value
                and not candidate_is_metadata
                and not candidate_is_mart
            ):
                # Keep only one physical dataset per staged dataset + role.
                # Old renamed serving rows (for example a prior table ref before
                # dataset rename) should be pruned so they do not continue to
                # appear in dataset pickers or get rebound during refresh.
                same_role_stale_records.append(c)
            elif candidate_serving_ref == "":
                # Legacy friendly wrapper for the current staged dataset/ref.
                legacy_wrapper_candidates.append(c)
        if existing is None:
            # Legacy friendly wrapper for the same staged dataset/ref.
            if legacy_wrapper_candidates:
                existing = min(
                    legacy_wrapper_candidates,
                    key=lambda item: int(getattr(item, "id", 0) or 0),
                )

    # --- Priority 2: look up by physical schema/table name ---
    if existing is None:
        with db.session.no_autoflush:
            existing = (
                db.session.query(SqlaTable)
                .filter_by(
                    database_id=serving_database_id,
                    schema=schema,
                    table_name=table_name,
                )
                .first()
            )

    # --- Priority 3: look up by raw table name without schema (legacy) ---
    if existing is None:
        with db.session.no_autoflush:
            existing = (
                db.session.query(SqlaTable)
                .filter_by(database_id=serving_database_id, table_name=table_name)
                .first()
            )
    with db.session.no_autoflush:
        exact_physical_match = (
            db.session.query(SqlaTable)
            .filter_by(
                database_id=serving_database_id,
                schema=schema,
                table_name=table_name,
            )
            .first()
        )
    if exact_physical_match is not None:
        if existing is not None and exact_physical_match.id != existing.id:
            stale_sv_records.append(existing)
        existing = exact_physical_match

    # Clean up stale physical datasets for this staged dataset/role.
    stale_records_to_delete: list[Any] = []
    if existing is not None:
        stale_records_to_delete.extend(
            stale
            for stale in stale_sv_records + same_role_stale_records
            if stale.id != existing.id
        )
    elif same_role_stale_records:
        same_role_stale_records.sort(key=lambda item: int(getattr(item, "id", 0) or 0))
        existing = same_role_stale_records[0]
        stale_records_to_delete.extend(
            stale for stale in same_role_stale_records[1:] if stale.id != existing.id
        )

    if stale_records_to_delete:
        for stale in stale_records_to_delete:
            if _has_dhis2_persistence_lock(stale):
                continue
            logger.info(
                "superset_dataset_service: removing stale DHIS2 SqlaTable id=%d ('%s')",
                stale.id,
                stale.table_name,
            )
            db.session.delete(stale)

    with db.session.no_autoflush:
        cross_database_stale_records = (
            db.session.query(SqlaTable)
            .filter(SqlaTable.database_id != serving_database_id)
            .filter(
                SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
                | SqlaTable.extra.like(f'%"dhis2_staged_dataset_id":{dataset_id}%')
            )
            .all()
        )
    for stale in cross_database_stale_records:
        try:
            extra = json.loads(stale.extra or "{}") if stale.extra else {}
        except Exception:  # pylint: disable=broad-except
            extra = {}
        if getattr(stale, "dataset_role", None) == DatasetRole.METADATA.value:
            continue
        candidate_serving_ref = str(extra.get("dhis2_serving_table_ref") or "").strip()
        if (
            candidate_serving_ref == serving_table_ref
            and not _has_dhis2_persistence_lock(stale)
        ):
            logger.info(
                "superset_dataset_service: removing stale cross-database SqlaTable id=%d ('%s')",
                stale.id,
                stale.table_name,
            )
            db.session.delete(stale)

    if existing is not None:
        if schema and existing.schema != schema:
            existing.schema = schema
        if existing.table_name != table_name:
            existing.table_name = table_name
        if existing.sql:
            existing.sql = None
        # Ensure dhis2_staged_dataset_id is present in extra so that the
        # datasource/api column-values endpoint can route to staging storage.
        # Also sync serving_database_id/name/table_ref so get_serving_database()
        # resolves correctly after engine migrations (e.g. DuckDB → ClickHouse).
        # Set the native role before tagging.  The tag must describe the
        # physical dataset rather than inherit a stale value from a prior
        # registration.
        existing.dataset_role = effective_dataset_role
        _ensure_dhis2_extra(
            existing,
            dataset_id,
            dataset_display_name=dataset_name,
            source_database_id=source_database_id,
            source_instance_ids=source_instance_ids,
            serving_database_id=serving_database_id,
            serving_database_name=serving_db.database_name,
            serving_table_ref=serving_table_ref,
        )
        _sync_columns(existing, serving_columns)
        db.session.commit()
        logger.info(
            "superset_dataset_service: updated existing SqlaTable id=%d for '%s' "
            "(dataset_role=%s)",
            existing.id,
            table_name,
            effective_dataset_role,
        )
        return existing.id

    # Build initial extra with all DHIS2 routing metadata
    initial_extra: dict[str, Any] = {
        "dhis2_staged_dataset_id": dataset_id,
        "dhis2_staged_local": True,
        "dhis2_role": _resolve_dhis2_swapper_role(
            effective_dataset_role, table_name
        ),
        "dhis2_serving": True,
        "dhis2_serving_database_id": serving_database_id,
        "dhis2_serving_database_name": serving_db.database_name,
        "dhis2_serving_table_ref": serving_table_ref,
        "dhis2_dataset_display_name": dataset_name,
    }
    if source_database_id is not None:
        initial_extra["dhis2_source_database_id"] = source_database_id
    if source_instance_ids:
        initial_extra["dhis2_source_instance_ids"] = source_instance_ids

    # Create a new physical SqlaTable pointing at the real serving table.
    sqla_table = SqlaTable(
        table_name=table_name,
        schema=schema,
        sql=None,
        database_id=serving_database_id,
        database=serving_db,
        is_managed_externally=False,
        extra=json.dumps(initial_extra),
    )
    sqla_table.dataset_role = effective_dataset_role

    _sync_columns(sqla_table, serving_columns)

    with db.session.no_autoflush:
        db.session.add(sqla_table)
        try:
            db.session.flush()  # get id
        except IntegrityError:
            # UNIQUE constraint on table_name fired — race condition or the
            # wizard's POST /api/v1/dataset/ already created the friendly record.
            db.session.rollback()
            existing = (
                db.session.query(SqlaTable)
                .filter_by(
                    database_id=serving_database_id,
                    schema=schema,
                    table_name=table_name,
                )
                .first()
            )
            if existing is not None and existing.database_id != serving_database_id:
                existing.database_id = serving_database_id
                existing.database = serving_db
            if existing is not None and schema and existing.schema != schema:
                existing.schema = schema
            if existing is not None and existing.table_name != table_name:
                existing.table_name = table_name
            if existing is not None and existing.sql:
                existing.sql = None
            if existing is None:
                raise  # genuinely unexpected — propagate
            _ensure_dhis2_extra(
                existing,
                dataset_id,
                dataset_display_name=dataset_name,
                source_database_id=source_database_id,
                source_instance_ids=source_instance_ids,
                serving_database_id=serving_database_id,
                serving_database_name=serving_db.database_name,
                serving_table_ref=serving_table_ref,
            )
            existing.dataset_role = effective_dataset_role
            _sync_columns(existing, serving_columns)
            db.session.commit()
            logger.info(
                "superset_dataset_service: resolved race-condition; "
                "using existing SqlaTable id=%d for '%s'",
                existing.id,
                table_name,
            )
            return existing.id

    logger.info(
        "superset_dataset_service: registered new SqlaTable id=%d name='%s' for DHIS2 dataset_id=%d",
        sqla_table.id,
        table_name,
        dataset_id,
    )
    db.session.commit()
    return sqla_table.id


def ensure_specialized_marts_for_sqla_table(sqla_table: Any) -> None:
    """Guarantee that the DHIS2 physical table referenced by *sqla_table* exists.

    If the dataset is DHIS2-backed, this calls ensure_serving_table() which
    materializes the main serving table AND all specialized marts (KPI, Map).
    """
    try:
        raw = getattr(sqla_table, "extra", None) or "{}"
        extra: dict = json.loads(raw) if isinstance(raw, str) else dict(raw)
        staged_id = extra.get("dhis2_staged_dataset_id")
        if staged_id and isinstance(staged_id, int):
            from flask import current_app
            from superset.app import create_app
            from superset.dhis2.staged_dataset_service import ensure_serving_table
            
            # Ensure we have an app context for DB operations
            ctx = None
            if not current_app:
                app = create_app()
                ctx = app.app_context()
                ctx.push()
            
            try:
                # A transient/missing ds_* source must not make metadata
                # loading fail for an already materialized serving dataset.
                try:
                    ensure_serving_table(staged_id)
                except Exception as exc:  # pylint: disable=broad-except
                    if "Code: 60" in str(exc) or "UNKNOWN_TABLE" in str(exc):
                        logger.warning(
                            "ensure_specialized_marts_for_sqla_table: skipping "
                            "serving build for staged dataset id=%s because its "
                            "staging table is missing",
                            staged_id,
                        )
                    else:
                        raise
            finally:
                if ctx:
                    ctx.pop()
    except Exception:  # pylint: disable=broad-except
        logger.warning(
            "ensure_specialized_marts_for_sqla_table: failed for SqlaTable id=%s",
            getattr(sqla_table, "id", None),
            exc_info=True,
        )


def _resolve_dhis2_swapper_role(dataset_role: Any, table_name: Any) -> str:
    """Return the role exposed to the DHIS2 dataset swapper.

    ``extra`` is used by the UI as routing metadata, so it must reflect the
    dataset's native role.  In particular, a friendly METADATA wrapper in
    ``dhis2_serving`` must not be labelled as a physical MART merely because
    it reads from one.
    """
    role = str(dataset_role or "").strip().upper()
    name = str(table_name or "").strip().lower()
    if role == "MART" or name.endswith("_mart"):
        return "MART"
    if role == "DHIS2_SOURCE_DATASET" or "SOURCE" in role:
        return "SOURCE"
    return "METADATA"


def _ensure_dhis2_extra(
    sqla_table: Any,
    dataset_id: int,
    *,
    dataset_display_name: str | None = None,
    source_database_id: int | None = None,
    source_database_name: str | None = None,
    source_instance_ids: list[int] | None = None,
    serving_database_id: int | None = None,
    serving_database_name: str | None = None,
    serving_table_ref: str | None = None,
) -> None:
    """Guarantee that SqlaTable.extra contains DHIS2 routing metadata.

    Idempotent — only writes when a field is absent or stale so we don't
    clobber other keys that may have been added by users.
    """
    try:
        raw = getattr(sqla_table, "extra", None) or "{}"
        extra: dict = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except (json.JSONDecodeError, TypeError):
        extra = {}

    changed = False
    if extra.get("dhis2_staged_dataset_id") != dataset_id:
        extra["dhis2_staged_dataset_id"] = dataset_id
        changed = True
    if not extra.get("dhis2_staged_local"):
        extra["dhis2_staged_local"] = True
        changed = True
    if source_database_id is not None and extra.get("dhis2_source_database_id") != source_database_id:
        extra["dhis2_source_database_id"] = source_database_id
        changed = True
    if source_database_name is not None and extra.get("dhis2_source_database_name") != source_database_name:
        extra["dhis2_source_database_name"] = source_database_name
        changed = True
    if source_instance_ids and extra.get("dhis2_source_instance_ids") != source_instance_ids:
        extra["dhis2_source_instance_ids"] = source_instance_ids
        changed = True
    if serving_database_id is not None and extra.get("dhis2_serving_database_id") != serving_database_id:
        extra["dhis2_serving_database_id"] = serving_database_id
        changed = True
    if serving_database_name is not None and extra.get("dhis2_serving_database_name") != serving_database_name:
        extra["dhis2_serving_database_name"] = serving_database_name
        changed = True
    if serving_table_ref is not None and extra.get("dhis2_serving_table_ref") != serving_table_ref:
        extra["dhis2_serving_table_ref"] = serving_table_ref
        changed = True
    if dataset_display_name is not None and extra.get("dhis2_dataset_display_name") != dataset_display_name:
        extra["dhis2_dataset_display_name"] = dataset_display_name
        changed = True
    if str(getattr(sqla_table, "schema", "") or "").strip() == DHIS2_SERVING_SCHEMA:
        swapper_role = _resolve_dhis2_swapper_role(
            getattr(sqla_table, "dataset_role", None),
            getattr(sqla_table, "table_name", None),
        )
        if extra.get("dhis2_role") != swapper_role:
            extra["dhis2_role"] = swapper_role
            changed = True
        if extra.get("dhis2_serving") is not True:
            extra["dhis2_serving"] = True
            changed = True
    if changed:
        sqla_table.extra = json.dumps(extra)


def _has_dhis2_persistence_lock(dataset: Any) -> bool:
    """Return whether an automated cleanup must retain a serving dataset."""
    schema = str(getattr(dataset, "schema", "") or "").strip().lower()
    name = str(getattr(dataset, "table_name", "") or "").strip()
    name_lower = name.lower()
    try:
        has_bound_charts = bool(getattr(dataset, "slices", None))
    except Exception:  # pylint: disable=broad-except
        has_bound_charts = False

    locked = (
        schema == DHIS2_SERVING_SCHEMA
        or has_bound_charts
        or any(token in name_lower for token in ("test", "mart", "preg", "sv_"))
    )
    if locked:
        logger.info(
            "Persistence lock active: Blocked deletion of dataset id=%s name='%s'",
            getattr(dataset, "id", None),
            name,
        )
    return locked


def _cleanup_orphaned_mart_dataset(
    dataset_id: int, serving_database_id: int, table_ref: str
) -> None:
    """Delete Superset SqlaTable for a mart whose ClickHouse backing table no longer exists."""
    from superset.connectors.sqla.models import SqlaTable
    from superset import db

    _, table_name = _parse_table_ref(table_ref)
    existing = (
        db.session.query(SqlaTable)
        .filter(
            SqlaTable.database_id == serving_database_id,
            SqlaTable.table_name == table_name,
        )
        .first()
    )
    if existing is None:
        return
    try:
        extra = json.loads(existing.extra or "{}")
    except Exception:  # pylint: disable=broad-except
        extra = {}
    if (
        extra.get("dhis2_staged_dataset_id") == dataset_id
        and not _has_dhis2_persistence_lock(existing)
    ):
        logger.info(
            "Removing orphaned mart Superset dataset %s (id=%d) — ClickHouse table absent",
            table_name,
            existing.id,
        )
        db.session.delete(existing)
        db.session.commit()


def _cleanup_legacy_mart_datasets(dataset_id: int, serving_database_id: int) -> None:
    """Remove old [KPI] and [Map] Superset dataset records for a staged dataset.

    Called after migrating to the single _mart architecture to keep the dataset
    list clean.
    """
    from superset.connectors.sqla.models import SqlaTable
    from superset import db

    legacy_prefixes = ("[KPI] ", "[Map] ", "[Map L")
    candidates = (
        db.session.query(SqlaTable)
        .filter(SqlaTable.database_id == serving_database_id)
        .all()
    )
    for ds in candidates:
        name = ds.table_name or ""
        if not any(name.startswith(p) for p in legacy_prefixes):
            continue
        try:
            extra = json.loads(ds.extra or "{}")
            if (
                extra.get("dhis2_staged_dataset_id") == dataset_id
                and not _has_dhis2_persistence_lock(ds)
            ):
                logger.info(
                    "_cleanup_legacy_mart_datasets: removing legacy '%s' (id=%d)",
                    name, ds.id,
                )
                db.session.delete(ds)
        except Exception:  # pylint: disable=broad-except
            continue
    db.session.commit()


def register_specialized_marts_as_superset_datasets(
    dataset_id: int,
    dataset_name: str,
    serving_table_ref: str,
    serving_columns: list[dict[str, Any]],
    serving_database_id: int,
    *,
    source_database_id: int | None = None,
    source_instance_ids: list[int] | None = None,
    engine: Any = None,
    dataset: Any = None,
) -> None:
    """Register the single consolidated _mart dataset in Superset.

    Registers one mart per source dataset using the original friendly dataset
    name (no [KPI] / [Map] prefix). Cleans up any legacy [KPI] / [Map] records.
    """
    schema, base_table_name = _parse_table_ref(serving_table_ref)

    # Identify all non-internal columns for the mart
    mart_columns = [
        c for c in serving_columns
        if not (c.get("extra") and "dhis2_is_internal" in str(c.get("extra")))
    ]

    def _mart_exists_check(check_fn_name: str, table_ref: str) -> bool:
        if engine is None or dataset is None:
            return True  # no engine to verify — optimistic
        check_fn = getattr(engine, check_fn_name, None)
        if check_fn is None:
            return True
        try:
            return bool(check_fn(dataset))
        except Exception as exc:  # pylint: disable=broad-except
            logger.warning(
                "register_specialized_marts: %s check raised an exception for %s "
                "(dataset_id=%s) — defaulting to optimistic registration. Error: %s",
                check_fn_name, table_ref, dataset_id, exc,
            )
            return True  # optimistic: attempt registration anyway

    from superset.datasets.policy import DatasetRole

    # Single consolidated _mart
    mart_table_name = f"{base_table_name}_mart"
    mart_ref = f"{schema}.{mart_table_name}" if schema else mart_table_name

    if _mart_exists_check("mart_exists", mart_ref):
        try:
            register_serving_table_as_superset_dataset(
                dataset_id=dataset_id,
                dataset_name=f"{dataset_name} [MART]",  # Add suffix to avoid collision with METADATA record
                serving_table_ref=mart_ref,
                serving_columns=mart_columns,
                serving_database_id=serving_database_id,
                source_database_id=source_database_id,
                source_instance_ids=source_instance_ids,
                # MART role so the consolidated user-facing `_mart` dataset
                # is available in chart/explore flows while the standard
                # dataset-management list remains METADATA-only.
                dataset_role=DatasetRole.MART.value,
            )
            logger.info(
                "register_specialized_marts: mart registered for dataset id=%s (%s)",
                dataset_id, mart_ref,
            )
        except Exception as exc:  # pylint: disable=broad-except
            logger.error(
                "register_specialized_marts: FAILED to register mart for dataset id=%s (%s): %s",
                dataset_id, mart_ref, exc,
            )
    else:
        logger.info(
            "register_specialized_marts: Skipping mart registration — "
            "ClickHouse table %s absent for dataset id=%s",
            mart_ref, dataset_id,
        )
        _cleanup_orphaned_mart_dataset(dataset_id, serving_database_id, mart_ref)

    # Cleanup legacy [KPI] and [Map] Superset records for this dataset
    _cleanup_legacy_mart_datasets(dataset_id, serving_database_id)


def cleanup_staged_dataset_superset_resources(
    dataset_id: int,
    serving_database_id: int | None = None,
    *,
    commit: bool = True,
) -> None:
    """Delete all Superset virtual datasets associated with a staged dataset.

    This includes the main thematic dataset and any specialized marts ([KPI],
    [Map], etc.) derived from it.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    # Find all SqlaTable records that reference this staged dataset id in their 'extra' JSON.
    # We use a LIKE filter on the 'extra' column to find them efficiently.
    query = db.session.query(SqlaTable).filter(
        SqlaTable.extra.like(f'%"dhis2_staged_dataset_id": {dataset_id}%')
    )
    if serving_database_id is not None:
        query = query.filter(SqlaTable.database_id == serving_database_id)

    datasets = query.all()
    for ds in datasets:
        if _has_dhis2_persistence_lock(ds):
            continue
        logger.info(
            "cleanup_staged_dataset_superset_resources: deleting associated Superset dataset id=%d ('%s')",
            ds.id,
            ds.table_name,
        )
        db.session.delete(ds)

    if commit:
        db.session.commit()


def repair_dhis2_chart_references() -> dict[str, int]:
    """Re-point charts from deprecated [KPI]/[Map]/[Map L*] datasets to the single _mart dataset.

    When marts are consolidated, old dual-mart datasets are deleted.
    This function ensures existing charts are migrated to the new unified
    mart dataset instead of breaking.
    """
    from superset.datasets.policy import DatasetRole
    from superset import db
    from superset.models.slice import Slice
    from superset.connectors.sqla.models import SqlaTable

    all_datasets = db.session.query(SqlaTable).filter(
        SqlaTable.extra.like('%"dhis2_staged_dataset_id":%')
    ).all()

    # Build map: staged_id -> mart SqlaTable.id (single mart per dataset)
    mart_by_staged_id: dict[int, int] = {}
    legacy_ids: set[int] = set()
    legacy_prefixes = ("[KPI] ", "[Map] ", "[Map L")

    for ds in all_datasets:
        try:
            extra = json.loads(ds.extra or "{}")
            staged_id = extra.get("dhis2_staged_dataset_id")
            if not staged_id:
                continue
            name = ds.table_name or ""
            if any(name.startswith(p) for p in legacy_prefixes):
                legacy_ids.add(ds.id)
            elif ds.dataset_role == DatasetRole.MART.value:
                mart_by_staged_id[staged_id] = ds.id
        except Exception:  # pylint: disable=broad-except
            continue

    if not legacy_ids:
        return {"repointed_charts": 0}

    charts = db.session.query(Slice).filter(
        Slice.datasource_id.in_(legacy_ids),
        Slice.datasource_type == "table",
    ).all()

    repointed_count = 0
    for chart in charts:
        dep_ds = db.session.get(SqlaTable, chart.datasource_id)
        if not dep_ds:
            continue
        try:
            extra = json.loads(dep_ds.extra or "{}")
            staged_id = extra.get("dhis2_staged_dataset_id")
            target_id = mart_by_staged_id.get(staged_id)
            if target_id and target_id != chart.datasource_id:
                logger.info(
                    "repair_charts: repointing chart id=%d ('%s') from legacy ds=%d to mart ds=%d",
                    chart.id, chart.slice_name, chart.datasource_id, target_id,
                )
                chart.datasource_id = target_id
                repointed_count += 1
        except Exception:  # pylint: disable=broad-except
            continue

    if repointed_count > 0:
        db.session.commit()
        logger.info("repair_charts: migrated %d charts to consolidated marts", repointed_count)

    return {"repointed_charts": repointed_count}


def _sync_columns(sqla_table: Any, serving_columns: list[dict[str, Any]]) -> None:
    """Add or update columns on a SqlaTable from a serving manifest column list."""
    from superset.connectors.sqla.models import TableColumn

    existing_by_name = {col.column_name: col for col in sqla_table.columns}
    seen: set[str] = set()

    for col_spec in serving_columns:
        col_name: str = col_spec.get("column_name") or col_spec.get("name") or ""
        if not col_name:
            continue

        _extra_raw = col_spec.get("extra") or {}
        if isinstance(_extra_raw, str):
            try:
                import json as _json
                _extra_raw = _json.loads(_extra_raw) or {}
            except Exception:  # pylint: disable=broad-except
                _extra_raw = {}
        extra_meta: dict = _extra_raw if isinstance(_extra_raw, dict) else {}

        # Internal columns (e.g. dhis2_instance) exist in the serving table for
        # backend routing but must NOT appear in chart control panels or the
        # Explore sidebar.  Exclude them from TableColumn records entirely.
        # Not adding to `seen` means any existing stale TableColumn for this
        # name will be removed by the cleanup pass below.
        if extra_meta.get("dhis2_is_internal"):
            continue

        seen.add(col_name)

        col_type: str = str(col_spec.get("type") or "VARCHAR")
        verbose_name: str = col_spec.get("verbose_name") or col_name

        # Determine flags from column metadata
        # DHIS2 period codes (for example ``202508`` and ``2025Q1``) are
        # categorical keys, not database timestamps.  Never infer ``is_dttm``
        # from ``dhis2_is_period``: doing so enables Superset time-grain
        # bucketing and turns the compact values into epoch milliseconds.
        is_dttm = bool(col_spec.get("is_dttm") or extra_meta.get("is_dttm"))
        is_period = bool(extra_meta.get("dhis2_is_period"))
        is_metric = col_type.upper() in ("FLOAT", "DOUBLE", "NUMERIC", "DECIMAL", "INTEGER", "BIGINT")
        is_dimension = not is_metric or is_period or bool(extra_meta.get("dhis2_is_ou_hierarchy"))

        # Persist DHIS2-specific metadata (dhis2_is_period, dhis2_is_ou_hierarchy,
        # etc.) into TableColumn.extra so DHIS2ColumnFilterControl and native
        # filter panels can read them without needing the staging API.
        extra_json = json.dumps(extra_meta) if extra_meta else None
        expression = col_spec.get("expression") or ""

        if col_name in existing_by_name:
            tc = existing_by_name[col_name]
            tc.type = col_type
            tc.verbose_name = verbose_name
            tc.is_dttm = is_dttm
            tc.filterable = True
            tc.groupby = is_dimension
            tc.expression = expression
            if extra_json is not None:
                tc.extra = extra_json
        else:
            tc = TableColumn(
                column_name=col_name,
                type=col_type,
                verbose_name=verbose_name,
                is_dttm=is_dttm,
                filterable=True,
                groupby=is_dimension,
                expression=expression,
                extra=extra_json or "",
            )
            sqla_table.columns.append(tc)

    # Remove columns that no longer exist in the serving table
    to_remove = [
        col for col in sqla_table.columns if col.column_name not in seen
    ]
    for col in to_remove:
        sqla_table.columns.remove(col)
