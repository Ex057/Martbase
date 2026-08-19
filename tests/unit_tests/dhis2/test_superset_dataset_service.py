import json
from contextlib import nullcontext
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from superset.dhis2.superset_dataset_service import (
    _build_metadata_wrapper_sql,
    _ensure_dhis2_extra,
    _is_metadata_wrapper_candidate,
    repair_charts_for_dhis2_staged_dataset,
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
        schema=None,
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
