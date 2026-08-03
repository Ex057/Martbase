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
"""Unit tests for the offline rule-based SQL generator."""

from superset.ai_insights.local_sql import build_local_sql_suggestions


def _climate_context():
    return [
        {
            "table": "sv_1_past_climate_data_mart",
            "schema": "main",
            "period_column": "period",
            "columns": [
                {
                    "name": "district_city",
                    "type": "VARCHAR",
                    "dhis2": {"ou_hierarchy": True, "ou_level": 3},
                },
                {"name": "period", "type": "VARCHAR", "dhis2": {"period": True}},
                {
                    "name": "cch_air_temperature_era5_land",
                    "type": "DOUBLE",
                    "dhis2": {"agg": "SUM"},
                },
            ],
        }
    ]


def test_builds_dimension_and_period_suggestions_with_period_filter():
    suggestions = build_local_sql_suggestions(
        None,
        _climate_context(),
        question="air temperature by district",
        metric="cch_air_temperature_era5_land",
        period="202501 202502",
        max_rows=1000,
    )
    sqls = [s["sql"] for s in suggestions]
    # by-dimension, by-period, dimension×period, raw preview
    assert len(sqls) == 4

    by_dim = sqls[0]
    # Correct backend-qualified table + double-quoted identifiers.
    assert 'FROM "main"."sv_1_past_climate_data_mart"' in by_dim
    # SUM chosen from the agg marker.
    assert 'SUM("cch_air_temperature_era5_land")' in by_dim
    # Grouped by the org-unit dimension, period filtered, bounded.
    assert 'GROUP BY "district_city"' in by_dim
    assert "\"period\" IN ('202501', '202502')" in by_dim
    assert "LIMIT 1000" in by_dim

    # Second suggestion is the time series over the period column.
    assert 'GROUP BY "period"' in sqls[1]


def test_indicator_uses_avg_not_sum():
    ctx = [
        {
            "table": "sv_2_incidence_mart",
            "schema": "dhis2_serving",
            "period_column": "period",
            "columns": [
                {"name": "district", "type": "VARCHAR",
                 "dhis2": {"ou_hierarchy": True, "ou_level": 3}},
                {"name": "period", "type": "VARCHAR", "dhis2": {"period": True}},
                {"name": "incidence_rate", "type": "DOUBLE",
                 "dhis2": {"indicator": True}},
            ],
        }
    ]
    suggestions = build_local_sql_suggestions(
        None, ctx, metric="incidence_rate", max_rows=500
    )
    by_dim = suggestions[0]["sql"]
    # Indicators are rates → AVG, never SUM. Also works on the ClickHouse schema.
    assert 'AVG("incidence_rate")' in by_dim
    assert 'FROM "dhis2_serving"."sv_2_incidence_mart"' in by_dim
    assert "SUM(" not in by_dim


def test_no_measure_yields_raw_preview_only():
    ctx = [
        {
            "table": "sv_3_names_mart",
            "schema": "main",
            "columns": [
                {"name": "district", "type": "VARCHAR"},
                {"name": "facility", "type": "VARCHAR"},
            ],
        }
    ]
    suggestions = build_local_sql_suggestions(None, ctx, question="list facilities")
    assert len(suggestions) == 1
    sql = suggestions[0]["sql"]
    assert sql.startswith("SELECT ")
    assert "GROUP BY" not in sql
    assert "LIMIT 100" in sql


def test_multiple_metrics_and_dimension_period_variant():
    ctx = [
        {
            "table": "sv_1_climate_mart",
            "schema": "main",
            "period_column": "period",
            "columns": [
                {"name": "district", "type": "VARCHAR",
                 "dhis2": {"ou_hierarchy": True, "ou_level": 3}},
                {"name": "period", "type": "VARCHAR", "dhis2": {"period": True}},
                {"name": "air_temp", "type": "DOUBLE", "dhis2": {"agg": "SUM"}},
                {"name": "incidence_rate", "type": "DOUBLE",
                 "dhis2": {"indicator": True}},
            ],
        }
    ]
    suggestions = build_local_sql_suggestions(
        None, ctx, metrics=["air_temp", "incidence_rate"], period="202501"
    )
    sqls = [s["sql"] for s in suggestions]
    # by-dimension, by-period, dimension×period, raw preview
    assert len(sqls) == 4
    by_dim = sqls[0]
    # Both metrics aggregated with their correct functions in one query.
    assert 'SUM("air_temp")' in by_dim
    assert 'AVG("incidence_rate")' in by_dim
    # The dimension×period cross-tab variant exists.
    assert any(
        'GROUP BY "district", "period"' in s for s in sqls
    ), "expected a dimension × period suggestion"


def test_org_unit_and_text_columns_are_never_aggregated():
    # Regression: a user picking org-unit/text columns as "metrics" must not
    # produce SUM("facility") (a text column) — which crashes the DB with a 500.
    ctx = [
        {
            "table": "sv_3_anc_mart",
            "schema": "dhis2_serving",
            "period_column": "period",
            "columns": [
                {"name": "national", "type": "VARCHAR",
                 "dhis2": {"ou_hierarchy": True, "ou_level": 1}},
                {"name": "facility", "type": "VARCHAR",
                 "dhis2": {"ou_hierarchy": True, "ou_level": 5}},
                {"name": "ou_level", "type": "INTEGER",
                 "dhis2": {"ou_hierarchy": True}},
                {"name": "period", "type": "VARCHAR", "dhis2": {"period": True}},
                {"name": "anc_1st_visit", "type": "DOUBLE",
                 "dhis2": {"agg": "SUM"}},
                {"name": "anc_2_coverage", "type": "DOUBLE",
                 "dhis2": {"indicator": True}},
            ],
        }
    ]
    suggestions = build_local_sql_suggestions(
        None,
        ctx,
        metrics=[
            "anc_1st_visit",
            "anc_2_coverage",
            "national",
            "facility",
            "ou_level",
        ],
        period="202512",
    )
    joined = " ".join(s["sql"] for s in suggestions)
    # Only real measures are aggregated.
    assert 'SUM("anc_1st_visit")' in joined
    assert 'AVG("anc_2_coverage")' in joined
    # Never aggregate org-unit / text / level columns.
    assert 'SUM("facility")' not in joined
    assert 'SUM("national")' not in joined
    assert 'SUM("ou_level")' not in joined


def test_empty_context_returns_nothing():
    assert build_local_sql_suggestions(None, []) == []


def test_period_values_are_sanitised():
    # Injection-ish junk is stripped to alphanumerics.
    suggestions = build_local_sql_suggestions(
        None,
        _climate_context(),
        metric="cch_air_temperature_era5_land",
        period="202501'; DROP TABLE x;--",
    )
    joined = " ".join(s["sql"] for s in suggestions)
    assert "DROP TABLE" not in joined
    assert "202501" in joined
