import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from superset.dhis2.backfill import (
    _classify_dhis2_dataset_role,
    _dhis2_repair_sort_key,
    repair_dhis2_chart_metadata_backfill,
)


def test_classify_dhis2_dataset_role_marks_logical_virtual_wrapper_as_metadata() -> None:
    dataset = SimpleNamespace(
        table_name="Malaria Routine Monthly Datasets",
        schema=None,
        sql="SELECT * FROM `dhis2_serving`.`sv_4_malaria_routine_monthly_datasets`",
    )

    role = _classify_dhis2_dataset_role(
        dataset,
        {
            "dhis2_staged_local": True,
            "dhis2_source_database_id": 5,
            "dhis2_serving_database_id": 4,
        },
    )

    assert role == "METADATA"


def test_dhis2_repair_sort_key_prioritizes_source_before_metadata() -> None:
    source_dataset = SimpleNamespace(
        id=25,
        table_name="sv_4_malaria_routine_monthly_datasets",
        schema="dhis2_serving",
        sql=None,
        extra='{"dhis2_staged_local": true}',
    )
    metadata_dataset = SimpleNamespace(
        id=28,
        table_name="Malaria Routine Monthly Datasets",
        schema=None,
        sql="SELECT * FROM `dhis2_serving`.`sv_4_malaria_routine_monthly_datasets`",
        extra='{"dhis2_staged_local": true}',
    )

    assert _dhis2_repair_sort_key(source_dataset) < _dhis2_repair_sort_key(
        metadata_dataset
    )


def test_repair_dhis2_chart_metadata_backfill_rescues_name_only_chart() -> None:
    class _FakeQuery:
        def __init__(self, *, all_result=None):
            self._all_result = list(all_result or [])

        def filter(self, *_args, **_kwargs):
            return self

        def all(self):
            return list(self._all_result)

    staged_dataset = SimpleNamespace(id=7)
    target_dataset = SimpleNamespace(
        id=23,
        table_name="test_dataset",
        extra=json.dumps(
            {
                "dhis2_staged_dataset_id": 7,
                "dhis2_staged_local": True,
            }
        ),
        dataset_role="SOURCE",
    )
    chart = SimpleNamespace(
        datasource_id=None,
        datasource_type="table",
        datasource_name="test_dataset",
        params=json.dumps({"datasource": "9__table"}),
        query_context=json.dumps(
            {
                "form_data": {"datasource": "9__table"},
                "datasource": {"id": 9, "type": "table"},
                "queries": [{"datasource": {"id": 9, "type": "table"}}],
            }
        ),
    )

    session = SimpleNamespace(
        query=MagicMock(
            side_effect=[
                _FakeQuery(all_result=[staged_dataset]),
                _FakeQuery(all_result=[target_dataset]),
                _FakeQuery(all_result=[chart]),
            ]
        ),
        commit=MagicMock(),
    )

    with patch("superset.db.session", session), patch(
        "superset.dhis2.superset_dataset_service._get_dhis2_sqla_table",
        return_value=None,
    ), patch(
        "superset.dhis2.superset_dataset_service.repair_charts_for_dhis2_staged_dataset",
        return_value=0,
    ):
        stats = repair_dhis2_chart_metadata_backfill()

    assert stats == {"strict_repaired_charts": 0, "legacy_repaired_charts": 1}
    assert chart.datasource_id == 23
    assert chart.datasource_name == "test_dataset"
    assert json.loads(chart.params)["datasource"] == "23__table"
    assert json.loads(chart.query_context)["datasource"]["id"] == 23
    assert "datasource" not in json.loads(chart.query_context)["queries"][0]
