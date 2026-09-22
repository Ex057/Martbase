import tempfile

from flask import Flask

from superset.expert_engine.service import (
    activate_bundle,
    build_bundle,
    bundle_preview_markdown,
    historical_evidence,
)


def test_bundle_enriches_only_same_season_matching_metric():
    app = Flask(__name__)
    with tempfile.TemporaryDirectory() as artifact_dir:
        app.config["AI_INSIGHTS_CONFIG"] = {"expert_engine_artifact_dir": artifact_dir}
        with app.app_context():
            mapping = {
                "datasets": [{
                    "name": "burden",
                    "dashboard_metric": "confirmed_cases",
                    "source_instance_id": 2,
                    "org_unit": "org_unit_id",
                    "period": "period",
                    "value": "confirmed_cases",
                    "reporting_rate": "reporting_rate",
                }]
            }
            bundle = build_bundle(
                b"org_unit_id,period,confirmed_cases,reporting_rate\n"
                b"OU1,2023Q2,10,95\nOU1,2024Q2,20,96\nOU1,2025Q2,30,97\n",
                "burden.csv",
                mapping,
            )
            activate_bundle(bundle["version"])
            context = {"charts": [{"query_result": {
                "columns": ["org_unit_id", "period", "confirmed_cases"],
                "sample_rows": [{"org_unit_id": "OU1", "period": "2026Q2", "confirmed_cases": 100}],
            }}]}
            evidence = historical_evidence(context)
            assert evidence[0]["status"] == "Epidemic action alert"
            assert historical_evidence({"charts": [{"query_result": {
                "columns": ["org_unit_id", "period", "confirmed_cases"],
                "sample_rows": [{"org_unit_id": "OU1", "period": "2026Q3", "confirmed_cases": 100}],
            }}]}) == []


def test_multi_file_bundle_returns_a_mock_style_preview():
    app = Flask(__name__)
    with tempfile.TemporaryDirectory() as artifact_dir:
        app.config["AI_INSIGHTS_CONFIG"] = {"expert_engine_artifact_dir": artifact_dir}
        with app.app_context():
            mapping = {"datasets": [{
                "name": "burden", "file": "burden.csv", "dashboard_metric": "confirmed_cases",
                "org_unit": "ou", "period": "period", "value": "cases",
            }, {
                "name": "climate", "file": "climate.csv", "dashboard_metric": "rainfall",
                "org_unit": "ou", "period": "period", "value": "rainfall",
            }]}
            bundle = build_bundle({
                "burden.csv": b"ou,period,cases\nA,2023Q2,1\nA,2024Q2,2\nA,2025Q2,3\n",
                "climate.csv": b"ou,period,rainfall\nA,2023Q2,4\nA,2024Q2,5\nA,2025Q2,6\n",
            }, None, mapping)
            preview = bundle_preview_markdown(bundle)
            assert "confirmed_cases" in preview
            assert "rainfall" in preview


def test_wide_csv_uses_all_numeric_indicator_columns():
    app = Flask(__name__)
    with tempfile.TemporaryDirectory() as artifact_dir:
        app.config["AI_INSIGHTS_CONFIG"] = {"expert_engine_artifact_dir": artifact_dir}
        with app.app_context():
            mapping = {"datasets": [{
                "name": "prevention", "file": "prevention.csv", "org_unit": "national",
                "period": "period", "value_columns": ["*"],
                "exclude_columns": ["dhis2_instance", "region", "district_city", "ou_level", "period_variant"],
            }]}
            bundle = build_bundle({"prevention.csv": (
                b"dhis2_instance,national,region,period,ou_level,period_variant,llin,ipt\n"
                b"Routine,Uganda,,202401,1,Jan 2024,10,20\n"
                b"Routine,Uganda,,202501,1,Jan 2025,15,25\n"
                b"Routine,Uganda,,202601,1,Jan 2026,20,30\n"
            )}, None, mapping)
            assert {item["metric"] for item in bundle["baselines"]} == {"llin", "ipt"}


def test_wide_csv_falls_back_to_rolling_history_when_only_one_year_is_available():
    app = Flask(__name__)
    with tempfile.TemporaryDirectory() as artifact_dir:
        app.config["AI_INSIGHTS_CONFIG"] = {"expert_engine_artifact_dir": artifact_dir}
        with app.app_context():
            mapping = {"datasets": [{
                "name": "prevention", "file": "prevention.csv", "org_unit": "national",
                "period": "period", "value_columns": ["*"],
                "exclude_columns": ["dhis2_instance", "region", "ou_level", "period_variant"],
            }]}
            bundle = build_bundle({"prevention.csv": (
                b"dhis2_instance,national,region,period,ou_level,period_variant,llin\n"
                b"Routine,Uganda,,202508,1,Aug 2025,10\n"
                b"Routine,Uganda,,202509,1,Sep 2025,15\n"
                b"Routine,Uganda,,202510,1,Oct 2025,20\n"
            )}, None, mapping)
            assert bundle["baselines"][0]["baseline_type"] == "rolling"
            assert bundle["baselines"][0]["sample_count"] == 3
