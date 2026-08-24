import json
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd

from superset.dhis2.superset_dataset_service import (
    _build_metadata_wrapper_sql,
    _get_dhis2_sqla_table,
    _ensure_dhis2_extra,
    _is_metadata_wrapper_candidate,
    collect_dhis2_chart_unresolved_refs,
    normalize_dhis2_chart_payload,
    repair_chart_bindings_for_dhis2_staged_dataset,
    repair_charts_for_dhis2_staged_dataset,
    resolve_clickhouse_serving_table_name,
    register_serving_table_as_superset_dataset,
)


def test_build_metadata_wrapper_sql_quotes_unquoted_ref() -> None:
    # The bug: an unquoted serving_table_ref produced
    # `SELECT * FROM dhis2_serving.sv_29_mal_pregnancy`, which the DHIS2 dialect
    # parses as an API endpoint -> 404. It must be backtick-quoted.
    assert (
        _build_metadata_wrapper_sql("dhis2_serving.sv_29_mal_pregnancy")
        == "SELECT * FROM `dhis2_serving`.`sv_29_mal_pregnancy`"
    )


def test_build_metadata_wrapper_sql_is_idempotent_for_backticked_ref() -> None:
    assert (
        _build_metadata_wrapper_sql("`dhis2_serving`.`sv_28_mal_prevention`")
        == "SELECT * FROM `dhis2_serving`.`sv_28_mal_prevention`"
    )


def test_build_metadata_wrapper_sql_normalises_double_quoted_ref() -> None:
    assert (
        _build_metadata_wrapper_sql('"dhis2_serving"."sv_1_foo"')
        == "SELECT * FROM `dhis2_serving`.`sv_1_foo`"
    )


def test_build_metadata_wrapper_sql_handles_bare_table() -> None:
    assert _build_metadata_wrapper_sql("sv_1_foo") == "SELECT * FROM `sv_1_foo`"


def test_resolve_clickhouse_serving_table_name_prefers_mart() -> None:
    clickhouse_database = MagicMock()
    clickhouse_database.get_df.return_value = pd.DataFrame(
        {
            "name": [
                "sv_36_test_03_dataset",
                "sv_36_test_03_dataset_mart",
                "sv_35_test_2_dataset",
            ]
        }
    )

    with patch(
        "superset.dhis2.superset_dataset_service.get_clickhouse_serving_database",
        return_value=clickhouse_database,
    ):
        resolved = resolve_clickhouse_serving_table_name("test_03_dataset")

    assert resolved == "sv_36_test_03_dataset_mart"
    clickhouse_database.get_df.assert_called_once_with(
        "SHOW TABLES FROM dhis2_serving"
    )


def test_ensure_dhis2_extra_updates_saved_dataset_display_name() -> None:
    sqla_table = SimpleNamespace(extra=json.dumps({"dhis2_staged_dataset_id": 7}))

    _ensure_dhis2_extra(
        sqla_table,
        7,
        dataset_display_name="MAL - Routine eHMIS Indicators [MART]",
        serving_table_ref="dhis2_serving.sv_7_mal_routine_ehmis_indicators_mart",
    )

    extra = json.loads(sqla_table.extra)
    assert (
        extra["dhis2_dataset_display_name"]
        == "MAL - Routine eHMIS Indicators [MART]"
    )
    assert (
        extra["dhis2_serving_table_ref"]
        == "dhis2_serving.sv_7_mal_routine_ehmis_indicators_mart"
    )


def test_is_metadata_wrapper_candidate_matches_logical_virtual_wrapper() -> None:
    sqla_table = SimpleNamespace(
        database_id=5,
        schema="dhis2_serving",
        sql="SELECT * FROM `dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
        extra=json.dumps(
            {
                "dhis2_staged_local": True,
                "dhis2_serving_table_ref": "`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
            }
        ),
    )

    assert _is_metadata_wrapper_candidate(
        sqla_table,
        source_database_id=5,
        serving_table_ref="`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
    )


def test_is_metadata_wrapper_candidate_rejects_physical_source_row() -> None:
    sqla_table = SimpleNamespace(
        database_id=4,
        schema="dhis2_serving",
        sql=None,
        extra=json.dumps(
            {
                "dhis2_staged_local": True,
                "dhis2_serving_table_ref": "`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
            }
        ),
    )

    assert not _is_metadata_wrapper_candidate(
        sqla_table,
        source_database_id=5,
        serving_table_ref="`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
    )


def test_register_serving_table_updates_source_row_not_mart_row() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None, first_result=None):
            self._all_result = list(all_result or [])
            self._first_result = first_result

        def filter(self, *_args, **_kwargs):
            return self

        def filter_by(self, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

        def first(self):
            return self._first_result

    mart_row = SimpleNamespace(
        id=19,
        schema="dhis2_serving",
        table_name="sv_7_mal_routine_ehmis_indicators_mart",
        database_id=4,
        sql=None,
        extra=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_serving_table_ref": "dhis2_serving.sv_7_mal_routine_ehmis_indicators_mart",
                "dhis2_dataset_display_name": "MAL - Routine eHMIS Indicators [MART]",
            }
        ),
        dataset_role="MART",
    )
    source_row = SimpleNamespace(
        id=23,
        schema="dhis2_serving",
        table_name="sv_7_mal_routine_ehmis_indicators",
        database_id=4,
        sql=None,
        extra=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_serving_table_ref": "`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
                "dhis2_dataset_display_name": "MAL - Routine eHMIS Indicators",
            }
        ),
        dataset_role="DHIS2_SOURCE_DATASET",
    )

    session = SimpleNamespace(
        get=MagicMock(return_value=SimpleNamespace(id=4, database_name="DHIS2 Serving (ClickHouse)")),
        query=MagicMock(
            side_effect=[
                _FakeQuery(all_result=[mart_row, source_row]),
                _FakeQuery(first_result=source_row),
                _FakeQuery(all_result=[]),
            ]
        ),
        no_autoflush=nullcontext(),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._sync_columns",
    ):
        sqla_id = register_serving_table_as_superset_dataset(
            dataset_id=7,
            dataset_name="MAL - Routine eHMIS Indicators",
            serving_table_ref="`dhis2_serving`.`sv_7_mal_routine_ehmis_indicators`",
            serving_columns=[],
            serving_database_id=4,
            source_database_id=5,
        )

    assert sqla_id == 23
    assert source_row.table_name == "sv_7_mal_routine_ehmis_indicators"
    assert source_row.schema == "dhis2_serving"
    assert source_row.dataset_role == "DHIS2_SOURCE_DATASET"
    assert mart_row.table_name == "sv_7_mal_routine_ehmis_indicators_mart"
    assert mart_row.dataset_role == "MART"


def test_repair_charts_for_dhis2_staged_dataset_updates_saved_chart_json() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    chart = SimpleNamespace(
        id=99,
        params=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "SOURCE",
                "datasource": "12__table",
            }
        ),
        query_context=json.dumps(
            {
                "form_data": {
                    "datasource": "12__table",
                    "dhis2_staged_dataset_id": 7,
                    "dhis2_dataset_role": "SOURCE",
                },
                "datasource": {"id": 12, "type": "table"},
                "queries": [{"datasource": {"id": 12, "type": "table"}}],
            }
        ),
        datasource_id=12,
        datasource_type="table",
        datasource_name="old name",
    )
    datasource = SimpleNamespace(
        id=23,
        datasource_type="table",
        name="new name",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        return_value=datasource,
    ):
        repaired = repair_charts_for_dhis2_staged_dataset(7, "SOURCE")

    assert repaired == 1
    assert chart.datasource_id == 23
    assert chart.datasource_type == "table"
    assert chart.datasource_name == "new name"

    params = json.loads(chart.params)
    assert params["datasource"] == "23__table"
    assert params["dhis2_staged_dataset_id"] == 7
    assert params["dhis2_dataset_role"] == "SOURCE"

    query_context = json.loads(chart.query_context)
    assert query_context["datasource"]["id"] == 23
    assert query_context["datasource"]["dhis2_staged_dataset_id"] == 7
    assert query_context["form_data"]["datasource"] == "23__table"
    assert "datasource" not in query_context["queries"][0]


def test_repair_charts_for_dhis2_staged_dataset_rewrites_stale_query_columns() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    chart = SimpleNamespace(
        id=101,
        params=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "SOURCE",
                "datasource": "12__table",
                "groupby": ["Old label"],
            }
        ),
        query_context=json.dumps(
            {
                "form_data": {
                    "datasource": "12__table",
                    "columns": ["Old label"],
                    "adhoc_filters": [{"col": "Old label", "op": "==", "val": "x"}],
                    "dhis2_staged_dataset_id": 7,
                    "dhis2_dataset_role": "SOURCE",
                },
                "datasource": {"id": 12, "type": "table"},
                "queries": [
                    {
                        "datasource": {"id": 12, "type": "table"},
                        "columns": ["Old label"],
                        "filters": [{"col": "Old label", "op": "==", "val": "x"}],
                    }
                ],
            }
        ),
        datasource_id=12,
        datasource_type="table",
        datasource_name="old name",
    )
    datasource = SimpleNamespace(
        id=23,
        datasource_type="table",
        name="new name",
        columns=[
            SimpleNamespace(
                column_name="new_column_name",
                verbose_name="Old label",
                extra=json.dumps({"dhis2_variable_id": "legacy_1"}),
            )
        ],
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        return_value=datasource,
    ):
        repaired = repair_charts_for_dhis2_staged_dataset(7, "SOURCE")

    assert repaired == 1

    params = json.loads(chart.params)
    query_context = json.loads(chart.query_context)

    assert params["groupby"] == ["new_column_name"]
    assert query_context["form_data"]["columns"] == ["new_column_name"]
    assert query_context["form_data"]["adhoc_filters"][0]["col"] == "new_column_name"
    assert query_context["queries"][0]["columns"] == ["new_column_name"]
    assert query_context["queries"][0]["filters"][0]["col"] == "new_column_name"


def test_repair_chart_bindings_for_dhis2_staged_dataset_preserves_mart_binding() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    mart = SimpleNamespace(
        id=23,
        datasource_type="table",
        name="mart dataset",
        dataset_role="MART",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    metadata = SimpleNamespace(
        id=24,
        datasource_type="table",
        name="metadata dataset",
        dataset_role="METADATA",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    chart = SimpleNamespace(
        id=102,
        slice_name="Pregnant women diagnosed with malaria",
        params=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "MART",
                "datasource": "23__table",
            }
        ),
        query_context=json.dumps(
            {
                "form_data": {
                    "dhis2_staged_dataset_id": 7,
                    "dhis2_dataset_role": "MART",
                    "datasource": "23__table",
                },
                "datasource": {"id": 23, "type": "table"},
            }
        ),
        datasource_id=23,
        datasource_type="table",
        datasource_name="mart dataset",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        get=MagicMock(side_effect=lambda model, pk: {23: mart}.get(pk)),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        side_effect=lambda dataset_id, role=None: {
            "MART": mart,
            "METADATA": metadata,
        }.get(role),
    ):
        repaired = repair_chart_bindings_for_dhis2_staged_dataset(7)

    assert repaired == 1
    assert chart.datasource_id == 23
    assert chart.datasource_name == "mart dataset"
    assert json.loads(chart.params)["dhis2_dataset_role"] == "MART"
    assert (
        json.loads(chart.query_context)["form_data"]["dhis2_dataset_role"]
        == "MART"
    )
    session.commit.assert_called_once()


def test_repair_chart_bindings_for_dhis2_staged_dataset_rebinds_source_to_mart() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    source = SimpleNamespace(
        id=12,
        datasource_type="table",
        name="source dataset",
        dataset_role="DHIS2_SOURCE_DATASET",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    mart = SimpleNamespace(
        id=23,
        datasource_type="table",
        name="mart dataset",
        dataset_role="MART",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    metadata = SimpleNamespace(
        id=24,
        datasource_type="table",
        name="metadata dataset",
        dataset_role="METADATA",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    chart = SimpleNamespace(
        id=103,
        slice_name="Pregnant women diagnosed with malaria",
        params=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "DHIS2_SOURCE_DATASET",
                "datasource": "12__table",
            }
        ),
        query_context=json.dumps(
            {
                "form_data": {
                    "dhis2_staged_dataset_id": 7,
                    "dhis2_dataset_role": "DHIS2_SOURCE_DATASET",
                    "datasource": "12__table",
                },
                "datasource": {"id": 12, "type": "table"},
            }
        ),
        datasource_id=12,
        datasource_type="table",
        datasource_name="source dataset",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        get=MagicMock(side_effect=lambda model, pk: {12: source}.get(pk)),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        side_effect=lambda dataset_id, role=None: {
            "MART": mart,
            "METADATA": metadata,
        }.get(role),
    ):
        repaired = repair_chart_bindings_for_dhis2_staged_dataset(7)

    assert repaired == 1
    assert chart.datasource_id == 23
    assert chart.datasource_name == "mart dataset"
    assert json.loads(chart.params)["dhis2_dataset_role"] == "MART"
    assert (
        json.loads(chart.query_context)["form_data"]["dhis2_dataset_role"]
        == "MART"
    )
    session.commit.assert_called_once()


def test_repair_chart_bindings_for_dhis2_staged_dataset_falls_back_to_metadata() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    source = SimpleNamespace(
        id=12,
        datasource_type="table",
        name="source dataset",
        dataset_role="DHIS2_SOURCE_DATASET",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    metadata = SimpleNamespace(
        id=24,
        datasource_type="table",
        name="metadata dataset",
        dataset_role="METADATA",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
    )
    chart = SimpleNamespace(
        id=104,
        slice_name="Pregnant women diagnosed with malaria",
        params=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "DHIS2_SOURCE_DATASET",
                "datasource": "12__table",
            }
        ),
        query_context=json.dumps(
            {
                "form_data": {
                    "dhis2_staged_dataset_id": 7,
                    "dhis2_dataset_role": "DHIS2_SOURCE_DATASET",
                    "datasource": "12__table",
                },
                "datasource": {"id": 12, "type": "table"},
            }
        ),
        datasource_id=12,
        datasource_type="table",
        datasource_name="source dataset",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        get=MagicMock(side_effect=lambda model, pk: {12: source}.get(pk)),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        side_effect=lambda dataset_id, role=None: {
            "MART": None,
            "METADATA": metadata,
        }.get(role),
    ):
        repaired = repair_chart_bindings_for_dhis2_staged_dataset(7)

    assert repaired == 1
    assert chart.datasource_id == 24
    assert chart.datasource_name == "metadata dataset"
    assert json.loads(chart.params)["dhis2_dataset_role"] == "METADATA"
    session.commit.assert_called_once()


def test_repair_chart_bindings_aborts_when_target_has_unresolved_refs() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    mart = SimpleNamespace(
        id=23,
        datasource_type="table",
        name="mart dataset",
        dataset_role="MART",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
        column_names=["period"],
        columns=[],
    )
    metadata = SimpleNamespace(
        id=24,
        datasource_type="table",
        name="metadata dataset",
        dataset_role="METADATA",
        extra=json.dumps({"dhis2_staged_dataset_id": 7}),
        column_names=["period"],
        columns=[],
    )
    original_params = json.dumps(
        {
            "dhis2_staged_dataset_id": 7,
            "dhis2_dataset_role": "MART",
            "datasource": "23__table",
            "metrics": ["SUM(c_105_oa02_re_attendance)"],
        }
    )
    original_query_context = json.dumps(
        {
            "form_data": {
                "dhis2_staged_dataset_id": 7,
                "dhis2_dataset_role": "MART",
                "datasource": "23__table",
                "metrics": ["SUM(c_105_oa02_re_attendance)"],
            },
            "datasource": {"id": 23, "type": "table"},
        }
    )
    chart = SimpleNamespace(
        id=105,
        slice_name="IPT2 coverage",
        params=original_params,
        query_context=original_query_context,
        datasource_id=23,
        datasource_type="table",
        datasource_name="mart dataset",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[chart])),
        get=MagicMock(side_effect=lambda _model, pk: {23: mart}.get(pk)),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        side_effect=lambda _dataset_id, role=None: {
            "MART": mart,
            "METADATA": metadata,
        }.get(role),
    ):
        repaired = repair_chart_bindings_for_dhis2_staged_dataset(7)

    assert repaired == 0
    assert chart.datasource_id == 23
    assert chart.datasource_name == "mart dataset"
    assert chart.params == original_params
    assert chart.query_context == original_query_context
    session.commit.assert_not_called()


def test_repair_chart_bindings_keeps_existing_binding_when_no_target_exists() -> None:
    chart = SimpleNamespace(
        datasource_id=359,
        datasource_type="table",
        datasource_name="mal_preg_dataset [MART]",
        params=json.dumps({"datasource": "359__table"}),
        query_context=json.dumps({"datasource": {"id": 359, "type": "table"}}),
    )
    session = SimpleNamespace(commit=MagicMock())

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        return_value=None,
    ):
        repaired = repair_chart_bindings_for_dhis2_staged_dataset(34)

    assert repaired == 0
    assert chart.datasource_id == 359
    assert chart.datasource_type == "table"
    assert chart.datasource_name == "mal_preg_dataset [MART]"
    session.commit.assert_not_called()


def test_normalize_dhis2_chart_payload_rewrites_metric_sql_and_reports_unresolved() -> None:
    datasource = SimpleNamespace(
        id=23,
        datasource_type="table",
        columns=[
            SimpleNamespace(
                column_name="new_indicator_rate",
                verbose_name="Pregnant women diagnosed with malaria (%)",
                extra=json.dumps(
                    {"alias": "mal_proportion_of_pregnant_women_diagnosed_with_malaria"}
                ),
            )
        ],
        column_names=["new_indicator_rate", "period"],
    )

    params, query_context, unresolved, changed = normalize_dhis2_chart_payload(
        json.dumps(
            {
                "datasource": "12__table",
                "metrics": [
                    "AVG(mal_proportion_of_pregnant_women_diagnosed_with_malaria)",
                    "SUM(c_108_ep01a2_malaria_total_deaths)",
                ],
            }
        ),
        json.dumps(
            {
                "form_data": {
                    "datasource": "12__table",
                    "metrics": [
                        "AVG(mal_proportion_of_pregnant_women_diagnosed_with_malaria)"
                    ],
                },
                "datasource": {"id": 12, "type": "table"},
                "queries": [
                    {
                        "datasource": {"id": 12, "type": "table"},
                        "metrics": [
                            "AVG(mal_proportion_of_pregnant_women_diagnosed_with_malaria)"
                        ],
                    }
                ],
            }
        ),
        datasource,
        identity={"dhis2_staged_dataset_id": 7, "dhis2_dataset_role": "MART"},
    )

    assert changed is True
    assert unresolved == {"params": ["c_108_ep01a2_malaria_total_deaths"]}

    json_params = json.loads(params or "{}")
    assert json_params["datasource"] == "23__table"
    assert json_params["metrics"][0] == "AVG(new_indicator_rate)"

    json_query_context = json.loads(query_context or "{}")
    assert json_query_context["form_data"]["datasource"] == "23__table"
    assert json_query_context["queries"][0]["metrics"][0] == "AVG(new_indicator_rate)"
    assert "datasource" not in json_query_context["queries"][0]


def test_collect_dhis2_chart_unresolved_refs_detects_simple_metric_strings() -> None:
    datasource = SimpleNamespace(column_names=["period", "new_indicator_rate"])

    unresolved = collect_dhis2_chart_unresolved_refs(
        {"metrics": ["SUM(c_105_oa02_re_attendance)"]},
        {"form_data": {"metrics": ["AVG(new_indicator_rate)"]}},
        datasource,
    )

    assert unresolved == {"params": ["c_105_oa02_re_attendance"]}


def test_collect_dhis2_chart_unresolved_refs_ignores_sort_and_boolean_noise() -> None:
    datasource = SimpleNamespace(column_names=["period", "new_indicator_rate"])

    unresolved = collect_dhis2_chart_unresolved_refs(
        {
            "metrics": ["SUM(new_indicator_rate)"],
            "orderby": [["__metric__", False]],
            "row_limit": 10,
        },
        {
            "form_data": {
                "metrics": ["SUM(new_indicator_rate)"],
                "orderby": [["__metric__", False]],
            },
            "queries": [
                {
                    "metrics": ["SUM(new_indicator_rate)"],
                    "orderby": [["__metric__", "desc"]],
                }
            ],
        },
        datasource,
    )

    assert unresolved == {}


def test_collect_dhis2_chart_unresolved_refs_ignores_save_placeholders() -> None:
    datasource = SimpleNamespace(column_names=["period", "new_indicator_rate"])

    unresolved = collect_dhis2_chart_unresolved_refs(
        {
            "metrics": ["__metric__", True],
            "metric": "__metric__",
            "True": True,
            "params": True,
        },
        {
            "form_data": {
                "metrics": ["__metric__", "True"],
                "query_context": True,
            },
            "queries": [{"metrics": [True, "__metric__"]}],
        },
        datasource,
    )

    assert unresolved == {}


def test_collect_dhis2_chart_unresolved_refs_ignores_named_metric_slots() -> None:
    datasource = SimpleNamespace(column_names=["period", "new_indicator_rate"])

    unresolved = collect_dhis2_chart_unresolved_refs(
        {
            "metrics": ["SUM(new_indicator_rate)"],
            "metric": "count",
            "secondary_metric": "sum__new_indicator_rate",
            "timeseries_limit_metric": "AVG(new_indicator_rate)",
        },
        {
            "form_data": {
                "metrics": ["SUM(new_indicator_rate)"],
                "metric": "count",
            },
            "queries": [
                {
                    "metrics": ["SUM(new_indicator_rate)"],
                    "timeseries_limit_metric": "sum__new_indicator_rate",
                }
            ],
        },
        datasource,
    )

    assert unresolved == {}


def test_get_dhis2_sqla_table_uses_db_session_lookup() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    candidate = SimpleNamespace(
        id=41,
        table_name="test_dataset",
        database_id=2,
        schema="dhis2_serving",
        extra=json.dumps({"dhis2_staged_dataset_id": 35}),
        dataset_role="SOURCE",
    )
    session = SimpleNamespace(
        query=MagicMock(return_value=_FakeQuery(all_result=[candidate])),
    )

    with patch("superset.db.session", session):
        resolved = _get_dhis2_sqla_table(35, "SOURCE")

    assert resolved is candidate


def test_get_dhis2_sqla_table_can_explicitly_ensure_missing_registration() -> None:
    class _FakeQuery:
        def __init__(self, candidates):
            self._candidates = candidates

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._candidates)

    candidate = SimpleNamespace(
        id=42,
        schema="dhis2_serving",
        extra=json.dumps({"dhis2_staged_dataset_id": 35}),
        dataset_role="MART",
    )
    session = SimpleNamespace(
        query=MagicMock(
            side_effect=[_FakeQuery([]), _FakeQuery([candidate]), _FakeQuery([candidate])]
        ),
        get=MagicMock(return_value=SimpleNamespace(id=35)),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.staged_dataset_service.ensure_serving_table"
    ) as ensure_serving_table:
        resolved = _get_dhis2_sqla_table(35, "MART", ensure_registered=True)
        resolved_again = _get_dhis2_sqla_table(35, "MART", ensure_registered=True)

    assert resolved is candidate
    assert resolved_again is candidate
    ensure_serving_table.assert_called_once_with(35)
    assert candidate.schema == "dhis2_serving"
