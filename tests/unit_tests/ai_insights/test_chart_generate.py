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
"""Tests for the offline (non-LLM) chart generation path.

``_build_chart_configs_python`` is what actually runs whenever a local provider
is configured, so this is the code path behind the "AI Create Charts" button in
this deployment.
"""
from __future__ import annotations

from typing import Any

import pytest

from superset.ai_insights.service import (
    _build_chart_configs_python,
    _column_matches_terms,
    _dataset_prompt_score,
    _is_technical_column,
    _params_for_viz,
    _parse_chart_intent,
    _prompt_terms,
)


def _dataset(
    dataset_id: int,
    table_name: str,
    columns: list[tuple[str, str]],
    row_count: int = 100,
) -> dict[str, Any]:
    return {
        "dataset_id": dataset_id,
        "table_name": table_name,
        "description": "",
        "row_count": row_count,
        "sample_rows": [],
        "metrics": [],
        "dataset_role": "MART",
        "columns": [{"name": name, "type": ctype} for name, ctype in columns],
    }


ANC = _dataset(
    7,
    "sv_3_anc_dataset_mart",
    [
        ("national", "VARCHAR"),
        ("district", "VARCHAR"),
        ("period", "VARCHAR"),
        ("anc_1st_visit", "INT"),
        ("anc_4th_or_more_visits", "INT"),
    ],
    row_count=12536,
)

CLIMATE = _dataset(
    4,
    "sv_1_past_climate_data_mart",
    [
        ("region", "VARCHAR"),
        ("period", "VARCHAR"),
        ("cch_air_temperature_era5_land", "DOUBLE"),
    ],
    row_count=2049,
)


class TestPromptTerms:
    def test_strips_stopwords_and_short_tokens(self) -> None:
        assert _prompt_terms("Show me the ANC visits by district") == {
            "anc",
            "visits",
            "district",
        }

    def test_handles_empty_prompt(self) -> None:
        assert _prompt_terms("") == set()


class TestColumnMatchesTerms:
    def test_matches_on_snake_case_tokens(self) -> None:
        assert _column_matches_terms("anc_1st_visit", {"anc"}) == 1

    def test_does_not_match_on_substrings(self) -> None:
        # "ou_level" must not match the unrelated term "level" appearing as a
        # substring of another word; token comparison keeps this exact.
        assert _column_matches_terms("district_city", {"dist"}) == 0

    def test_no_terms_scores_zero(self) -> None:
        assert _column_matches_terms("anything", set()) == 0


class TestParseChartIntent:
    @pytest.mark.parametrize(
        "prompt,expected",
        [
            ("pie chart of ANC visits", "pie"),
            ("malaria trend over time", "echarts_timeseries_line"),
            ("compare districts with a bar chart", "echarts_timeseries_bar"),
            ("show me a map of cases", "dhis2_map"),
            ("detailed table of visits", "table"),
            ("total number of visits as a KPI", "big_number_total"),
            ("heatmap of district vs period", "heatmap_v2"),
        ],
    )
    def test_maps_keywords_to_viz_types(self, prompt: str, expected: str) -> None:
        assert expected in _parse_chart_intent(prompt)["viz_hints"]

    def test_prompt_without_viz_keyword_has_no_hints(self) -> None:
        assert _parse_chart_intent("ANC visits by district")["viz_hints"] == []

    def test_wants_map_tracks_map_hint(self) -> None:
        assert _parse_chart_intent("choropleth of cases")["wants_map"] is True
        assert _parse_chart_intent("pie of cases")["wants_map"] is False


class TestBuildChartConfigsPython:
    def test_requested_viz_type_survives_truncation(self) -> None:
        """Regression: a requested pie chart was dropped by ``[:num_charts]``.

        Charts are built in a fixed schema order (big number, bar, trend, pie,
        table...), so asking for one chart used to always return a big number.
        """
        charts = _build_chart_configs_python([ANC], 1, "pie chart of ANC visits")
        assert [c["viz_type"] for c in charts] == ["pie"]

    def test_trend_request_returns_line_chart_first(self) -> None:
        charts = _build_chart_configs_python(
            [ANC], 1, "ANC visits trend over time"
        )
        assert charts[0]["viz_type"] == "echarts_timeseries_line"

    def test_prompt_steers_dimension_choice(self) -> None:
        """"by district" should group by district, not the first string column."""
        charts = _build_chart_configs_python(
            [ANC], 1, "pie chart of visits by district"
        )
        assert charts[0]["params"]["groupby"] == ["district"]

    def test_prompt_steers_metric_choice(self) -> None:
        charts = _build_chart_configs_python(
            [ANC], 1, "pie chart of anc_4th_or_more_visits by district"
        )
        metric = charts[0]["params"]["metric"]
        assert "anc_4th_or_more_visits" in metric["sqlExpression"]

    def test_without_hints_preserves_default_ordering(self) -> None:
        charts = _build_chart_configs_python([ANC], 2, "ANC visits by district")
        assert charts[0]["viz_type"] == "big_number_total"

    def test_all_charts_reference_a_real_dataset(self) -> None:
        charts = _build_chart_configs_python([ANC, CLIMATE], 4, "ANC visits")
        assert charts
        for chart in charts:
            assert chart["dataset_id"] in {7, 4}
            assert chart["params"]["datasource"] == f"{chart['dataset_id']}__table"

    def test_respects_num_charts(self) -> None:
        assert len(_build_chart_configs_python([ANC], 3, "ANC visits")) == 3

    def test_single_dataset_keeps_all_charts_on_it(self) -> None:
        """An explicit dataset selection must not leak in other datasets."""
        charts = _build_chart_configs_python([ANC], 5, "ANC visits by district")
        assert {c["dataset_id"] for c in charts} == {7}


class TestTechnicalColumns:
    @pytest.mark.parametrize(
        "name", ["ou_level", "OU_LEVEL", "district_id", "org_uid", "area_code"]
    )
    def test_identifier_columns_are_technical(self, name: str) -> None:
        assert _is_technical_column(name) is True

    @pytest.mark.parametrize(
        "name",
        [
            "anc_1st_visit",
            "cases_confirmed",
            # Real measures that a broad "_level" rule would wrongly demote.
            "stock_level",
            "water_level",
        ],
    )
    def test_measures_are_not_technical(self, name: str) -> None:
        assert _is_technical_column(name) is False

    def test_metric_does_not_aggregate_hierarchy_depth(self) -> None:
        """Regression: charts defaulted to SUM(ou_level), which is meaningless."""
        dataset = _dataset(
            99,
            "sv_9_mart",
            [
                ("district", "VARCHAR"),
                ("ou_level", "INT"),
                ("cases_confirmed", "INT"),
            ],
        )
        charts = _build_chart_configs_python([dataset], 1, "total cases")
        metric = charts[0]["params"]["metric"]
        assert "ou_level" not in metric["sqlExpression"]
        assert "cases_confirmed" in metric["sqlExpression"]

    def test_technical_column_still_used_when_nothing_else_numeric(self) -> None:
        dataset = _dataset(
            98,
            "sv_8_mart",
            [("district", "VARCHAR"), ("ou_level", "INT")],
        )
        charts = _build_chart_configs_python([dataset], 1, "total by district")
        assert charts, "should still produce a chart rather than nothing"


class TestRequiredControls:
    """Each viz type has controls that leave the field blank in Explore if
    missing or wrongly shaped. These encode the exact shapes the plugins'
    controlPanel definitions require."""

    def _charts(self, prompt: str, n: int = 8) -> list[dict[str, Any]]:
        return _build_chart_configs_python([ANC], n, prompt)

    def test_bar_chart_has_string_x_axis(self) -> None:
        """Regression: bar charts shipped with no x_axis, the one required control."""
        charts = self._charts("bar chart of visits by district")
        bars = [c for c in charts if c["viz_type"] == "echarts_timeseries_bar"]
        assert bars
        for chart in bars:
            x_axis = chart["params"].get("x_axis")
            assert isinstance(x_axis, str) and x_axis, f"bad x_axis: {x_axis!r}"

    def test_line_chart_has_string_x_axis(self) -> None:
        charts = self._charts("trend of visits over time")
        lines = [c for c in charts if c["viz_type"] == "echarts_timeseries_line"]
        assert lines
        for chart in lines:
            assert isinstance(chart["params"].get("x_axis"), str)

    def test_bar_x_axis_prefers_the_named_dimension(self) -> None:
        charts = self._charts("bar chart by district")
        bar = next(c for c in charts if c["viz_type"] == "echarts_timeseries_bar")
        assert bar["params"]["x_axis"] == "district"

    def test_line_x_axis_prefers_the_period_column(self) -> None:
        charts = self._charts("trend over time")
        line = next(c for c in charts if c["viz_type"] == "echarts_timeseries_line")
        assert line["params"]["x_axis"] == "period"

    def test_heatmap_groupby_is_a_bare_string(self) -> None:
        """heatmap_v2 overrides groupby to multi: false; a list renders blank."""
        charts = self._charts("heatmap of visits")
        heatmaps = [c for c in charts if c["viz_type"] == "heatmap_v2"]
        assert heatmaps
        for chart in heatmaps:
            assert isinstance(chart["params"]["groupby"], str)

    def test_pie_uses_singular_metric_and_list_groupby(self) -> None:
        charts = self._charts("pie chart by district")
        pie = next(c for c in charts if c["viz_type"] == "pie")
        assert isinstance(pie["params"]["metric"], dict)
        assert isinstance(pie["params"]["groupby"], list)

    def test_big_number_uses_singular_metric(self) -> None:
        charts = self._charts("total visits")
        kpi = next(c for c in charts if c["viz_type"] == "big_number_total")
        assert isinstance(kpi["params"]["metric"], dict)

    def test_table_declares_aggregate_query_mode(self) -> None:
        charts = self._charts("detailed table of visits")
        table = next(c for c in charts if c["viz_type"] == "table")
        assert table["params"]["query_mode"] == "aggregate"
        assert table["params"]["metrics"]

    def test_timeseries_family_uses_plural_metrics(self) -> None:
        charts = self._charts("bar chart and trend over time")
        for chart in charts:
            if chart["viz_type"] in {
                "echarts_timeseries_bar",
                "echarts_timeseries_line",
            }:
                assert isinstance(chart["params"]["metrics"], list)
                assert chart["params"]["metrics"]

    def test_every_metric_sets_has_custom_label(self) -> None:
        """Without hasCustomLabel, AdhocMetric discards `label` for raw SQL."""
        for chart in self._charts("bar chart of visits by district"):
            params = chart["params"]
            metrics = list(params.get("metrics") or [])
            if params.get("metric"):
                metrics.append(params["metric"])
            assert metrics
            for metric in metrics:
                assert metric.get("hasCustomLabel") is True, metric


class TestParamsByViz:
    def test_every_alt_viz_type_has_valid_params(self) -> None:
        """Regression: swapping viz type reused incompatible params."""
        for chart in _build_chart_configs_python([ANC], 8, "charts of ANC visits"):
            by_viz = chart["params_by_viz"]
            for alt in chart["alt_viz_types"]:
                viz = alt["viz_type"]
                assert viz in by_viz, f"{viz} offered with no params"
                params = by_viz[viz]
                assert params["viz_type"] == viz
                if viz in {"echarts_timeseries_bar", "echarts_timeseries_line"}:
                    assert isinstance(params.get("x_axis"), str)
                    assert params.get("metrics")
                if viz in {"pie", "big_number_total"}:
                    assert isinstance(params.get("metric"), dict)
                if viz == "heatmap_v2":
                    assert isinstance(params.get("groupby"), str)

    def test_params_by_viz_includes_the_charts_own_type(self) -> None:
        for chart in _build_chart_configs_python([ANC], 6, "ANC visits"):
            assert chart["viz_type"] in chart["params_by_viz"]

    def test_unsupported_alt_types_are_not_offered(self) -> None:
        """A dataset with no period column cannot support a heatmap."""
        no_period = _dataset(
            50,
            "sv_5_mart",
            [("district", "VARCHAR"), ("cases", "INT")],
        )
        for chart in _build_chart_configs_python([no_period], 8, "charts"):
            assert "heatmap_v2" not in chart["params_by_viz"]
            offered = {a["viz_type"] for a in chart["alt_viz_types"]}
            assert offered <= set(chart["params_by_viz"])


class TestParamsForViz:
    METRICS = [
        {
            "expressionType": "SQL",
            "sqlExpression": "SUM(cases)",
            "label": "Cases",
            "hasCustomLabel": True,
        }
    ]

    def _build(self, viz: str, **kwargs: Any) -> dict[str, Any] | None:
        defaults: dict[str, Any] = {
            "ds_id": 1,
            "label_col": "district",
            "period_col": "period",
            "metric_exprs": self.METRICS,
        }
        defaults.update(kwargs)
        return _params_for_viz(viz, **defaults)

    def test_returns_none_without_metrics(self) -> None:
        assert self._build("pie", metric_exprs=[]) is None

    def test_returns_none_for_heatmap_without_period(self) -> None:
        assert self._build("heatmap_v2", period_col=None) is None

    def test_returns_none_for_pie_without_dimension(self) -> None:
        assert self._build("pie", label_col=None) is None

    def test_returns_none_for_unknown_viz_type(self) -> None:
        assert self._build("not_a_real_viz") is None

    def test_bar_falls_back_to_period_when_no_dimension(self) -> None:
        params = self._build("echarts_timeseries_bar", label_col=None)
        assert params is not None
        assert params["x_axis"] == "period"

    def test_line_falls_back_to_dimension_when_no_period(self) -> None:
        params = self._build("echarts_timeseries_line", period_col=None)
        assert params is not None
        assert params["x_axis"] == "district"

    def test_map_requires_an_org_unit_column(self) -> None:
        assert self._build("dhis2_map") is None
        params = self._build("dhis2_map", ou_col="district", ou_level=3)
        assert params is not None
        assert params["org_unit_column"] == "district"
        assert params["boundary_levels"] == [3]

    def test_every_result_carries_datasource_and_viz_type(self) -> None:
        for viz in [
            "big_number_total",
            "pie",
            "echarts_timeseries_bar",
            "echarts_timeseries_line",
            "table",
            "heatmap_v2",
        ]:
            params = self._build(viz)
            assert params is not None, viz
            assert params["viz_type"] == viz
            assert params["datasource"] == "1__table"
            assert params["adhoc_filters"] == []


class TestDatasetPromptScore:
    def test_ranks_prompt_named_dataset_above_larger_irrelevant_one(self) -> None:
        prompt = "average air temperature by region"
        # CLIMATE has ~6x fewer rows than ANC, so relevance must win.
        assert _dataset_prompt_score(CLIMATE, prompt) > _dataset_prompt_score(
            ANC, prompt
        )

    def test_anc_prompt_prefers_anc_dataset(self) -> None:
        prompt = "show me ANC visits by district"
        assert _dataset_prompt_score(ANC, prompt) > _dataset_prompt_score(
            CLIMATE, prompt
        )
