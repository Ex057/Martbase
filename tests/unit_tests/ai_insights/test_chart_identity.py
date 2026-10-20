from __future__ import annotations

import json
from types import SimpleNamespace

from superset.ai_insights.chart_identity import (
    AI_CHART_METADATA_KEY,
    add_ai_chart_metadata,
    build_ai_chart_identity,
    get_ai_chart_identity,
    record_ai_chart_tombstone,
)


def make_chart_config(**overrides):
    config = {
        "slice_name": "Admissions by Region",
        "viz_type": "echarts_timeseries_bar",
        "datasource_id": 42,
        "datasource_type": "table",
        "params": {"color_scheme": "martbase"},
    }
    config.update(overrides)
    return config


def test_ai_chart_identity_is_stable_across_display_option_changes() -> None:
    original = make_chart_config()
    restyled = make_chart_config(
        slice_name="  admissions   BY region ",
        params={"color_scheme": "another-scheme", "show_legend": False},
    )

    assert build_ai_chart_identity(original) == build_ai_chart_identity(restyled)


def test_ai_chart_identity_changes_for_a_different_logical_chart() -> None:
    original = make_chart_config()
    different = make_chart_config(viz_type="pie")

    assert build_ai_chart_identity(original) != build_ai_chart_identity(different)


def test_ai_metadata_round_trips_through_chart_params() -> None:
    params = add_ai_chart_metadata({"metric": "value"}, "stable-identity")
    chart = SimpleNamespace(params=json.dumps(params))

    assert params[AI_CHART_METADATA_KEY]["source"] == "ai_insights"
    assert get_ai_chart_identity(chart) == "stable-identity"


def test_record_tombstone_ignores_non_ai_chart(mocker) -> None:
    upsert = mocker.patch(
        "superset.ai_insights.chart_identity.KeyValueDAO.upsert_entry"
    )
    chart = SimpleNamespace(params="{}")

    assert record_ai_chart_tombstone(chart) is False
    upsert.assert_not_called()
