from __future__ import annotations

import csv
import hashlib
import hmac
import json
import re
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean, median, pstdev
from typing import Any

from flask import current_app


class ExpertEngineError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def _artifact_dir() -> Path:
    config = current_app.config.get("AI_INSIGHTS_CONFIG") or {}
    path = Path(config.get("expert_engine_artifact_dir") or "/var/lib/superset/expert-engine")
    try:
        path.mkdir(parents=True, exist_ok=True)
        return path
    except OSError:
        # The production default may not be writable in a developer checkout.
        # Use Superset's writable instance directory for local testing.
        fallback = Path(current_app.instance_path) / "expert-engine"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback


def _signature(payload: dict[str, Any]) -> str:
    secret = str(current_app.config.get("SECRET_KEY") or "")
    message = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def _normalise(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _season_key(period: str) -> str | None:
    value = str(period or "").strip().upper()
    quarter = re.search(r"Q([1-4])$", value)
    if quarter:
        return f"Q{quarter.group(1)}"
    month = re.search(r"(?:^|[-/])([01][0-9])$", value) or re.search(
        r"^\d{4}([01][0-9])$", value
    )
    if month and 1 <= int(month.group(1)) <= 12:
        return f"M{month.group(1)}"
    return None


def _number(value: Any) -> float | None:
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def validate_mapping(mapping: dict[str, Any]) -> list[str]:
    datasets = mapping.get("datasets") if isinstance(mapping, dict) else None
    if not isinstance(datasets, list) or not datasets:
        return ["Mapping must contain a non-empty 'datasets' list."]
    errors = []
    required = ("name", "period")
    for index, item in enumerate(datasets):
        if not isinstance(item, dict):
            errors.append(f"datasets[{index}] must be an object.")
            continue
        missing = [field for field in required if not str(item.get(field) or "").strip()]
        if missing:
            errors.append(f"datasets[{index}] missing: {', '.join(missing)}.")
        if not item.get("org_unit") and not item.get("org_unit_columns"):
            errors.append(f"datasets[{index}] needs org_unit or org_unit_columns.")
        if not item.get("value") and not item.get("value_columns"):
            errors.append(f"datasets[{index}] needs value or value_columns.")
        if not str(item.get("file") or "").strip():
            errors.append(f"datasets[{index}] missing: file.")
    return errors


def preview_csv(raw: bytes, mapping: dict[str, Any]) -> dict[str, Any]:
    if len(raw) > 50 * 1024 * 1024:
        raise ExpertEngineError("CSV is larger than the 50 MB local training limit.")
    try:
        text = raw.decode("utf-8-sig")
        rows = list(csv.DictReader(text.splitlines()))
    except (UnicodeDecodeError, csv.Error) as ex:
        raise ExpertEngineError("CSV must be UTF-8 encoded with a header row.") from ex
    if not rows:
        raise ExpertEngineError("CSV contains no data rows.")
    headers = list(rows[0].keys())
    required = {field for item in mapping.get("datasets", []) for field in (
        item.get("org_unit"), item.get("period"), item.get("value"), item.get("reporting_rate")
    ) if field}
    return {
        "headers": headers,
        "row_count": len(rows),
        "missing_mapping_columns": sorted(required - set(headers)),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def build_bundle(raw_files: dict[str, bytes] | bytes, filename: str | None, mapping: dict[str, Any]) -> dict[str, Any]:
    if isinstance(raw_files, bytes):
        raw_files = {str(filename or "upload.csv"): raw_files}
        # Preserve the one-file workflow while making the mapping explicit.
        for spec in mapping.get("datasets") or []:
            spec.setdefault("file", str(filename or "upload.csv"))
    errors = validate_mapping(mapping)
    if errors:
        raise ExpertEngineError(" ".join(errors))
    previews = {}
    parsed_rows = {}
    for file_name, raw in raw_files.items():
        previews[file_name] = preview_csv(raw, {"datasets": []})
        parsed_rows[file_name] = list(csv.DictReader(raw.decode("utf-8-sig").splitlines()))
    # Keep the most-specific baseline (the same calendar season over several
    # years) separate from a rolling fallback.  Many DHIS2 extracts contain a
    # single recent 12-month window, so a same-month-across-years baseline
    # cannot be calculated from an otherwise perfectly useful export.
    evidence: dict[str, dict[str, list[float]]] = {}
    completeness: dict[str, list[float]] = {}
    for spec in mapping["datasets"]:
        file_name = str(spec["file"])
        if file_name not in parsed_rows:
            raise ExpertEngineError(f"Mapping references '{file_name}', which was not uploaded.")
        org_columns = spec.get("org_unit_columns") or [spec.get("org_unit")]
        required = {field for field in (*org_columns, spec.get("period"), spec.get("reporting_rate")) if field}
        value_columns = spec.get("value_columns") or [spec.get("value")]
        if value_columns != ["*"]:
            required.update(field for field in value_columns if field)
        missing = required - set(previews[file_name]["headers"])
        if missing:
            raise ExpertEngineError(f"{file_name} is missing mapped columns: {', '.join(sorted(missing))}")
        excluded = set(spec.get("exclude_columns") or [])
        dimension_columns = {*org_columns, spec.get("period"), spec.get("reporting_rate"), *excluded}
        if value_columns == ["*"]:
            value_columns = [
                column for column in previews[file_name]["headers"]
                if column not in dimension_columns and not column.startswith("_")
                and any(_number(row.get(column)) is not None for row in parsed_rows[file_name])
            ]
        for row in parsed_rows[file_name]:
            ou = next((str(row.get(column) or "").strip() for column in org_columns if str(row.get(column) or "").strip()), "")
            season = _season_key(str(row.get(spec["period"]) or ""))
            if not ou or not season:
                continue
            source = str(spec.get("source_instance_id") or "default")
            for column in value_columns:
                value = _number(row.get(column))
                if value is None:
                    continue
                metric = (spec.get("metric_aliases") or {}).get(column) or (
                    spec.get("dashboard_metric") if len(value_columns) == 1 else column
                ) or column
                key = "|".join((source, _normalise(metric), ou, season))
                evidence.setdefault(key, {"values": [], "metric": metric, "source_instance_id": source, "org_unit_id": ou, "season": season})["values"].append(value)
                rolling_key = "|".join((source, _normalise(metric), ou, "rolling"))
                evidence.setdefault(rolling_key, {
                    "values": [], "metric": metric, "source_instance_id": source,
                    "org_unit_id": ou, "season": "rolling", "baseline_type": "rolling",
                })["values"].append(value)
                if spec.get("reporting_rate"):
                    rate = _number(row.get(spec["reporting_rate"]))
                    if rate is not None:
                        completeness.setdefault(key, []).append(rate)
                        completeness.setdefault(rolling_key, []).append(rate)
    baselines = []
    seasonal_groups = set()
    for key, item in evidence.items():
        if item.get("baseline_type") == "rolling":
            continue
        values = item.pop("values")
        if len(values) < 3:
            continue
        ordered = sorted(values)
        q3 = ordered[round((len(ordered) - 1) * .75)]
        baseline = {
            **item,
            "sample_count": len(values),
            "median": round(median(values), 3),
            "q3_alert": round(q3, 3),
            "action_limit": round(mean(values) + 2 * pstdev(values), 3),
        }
        rates = completeness.get(key) or []
        if rates:
            baseline["avg_reporting_rate"] = round(mean(rates), 3)
        baselines.append(baseline)
        seasonal_groups.add((item["source_instance_id"], _normalise(item["metric"]), item["org_unit_id"]))
    for key, item in evidence.items():
        if item.get("baseline_type") != "rolling":
            continue
        values = item.pop("values")
        group = (item["source_instance_id"], _normalise(item["metric"]), item["org_unit_id"])
        # Prefer seasonally comparable history whenever it exists.
        if len(values) < 3 or group in seasonal_groups:
            continue
        ordered = sorted(values)
        q3 = ordered[round((len(ordered) - 1) * .75)]
        baseline = {
            **item,
            "sample_count": len(values),
            "median": round(median(values), 3),
            "q3_alert": round(q3, 3),
            "action_limit": round(mean(values) + 2 * pstdev(values), 3),
        }
        rates = completeness.get(key) or []
        if rates:
            baseline["avg_reporting_rate"] = round(mean(rates), 3)
        baselines.append(baseline)
    if not baselines:
        raise ExpertEngineError("No baseline could be built: each metric/org-unit needs at least three numeric observations.")
    created = datetime.now(UTC).replace(microsecond=0).isoformat()
    bundle = {
        "schema_version": 1,
        "version": f"research-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}",
        "status": "draft",
        "created_at": created,
        "provenance": {"files": [{"filename": Path(name).name, **preview} for name, preview in previews.items()], "row_count": sum(item["row_count"] for item in previews.values()), "mapping_sha256": hashlib.sha256(json.dumps(mapping, sort_keys=True).encode()).hexdigest()},
        "mapping": mapping,
        "baselines": baselines,
    }
    bundle["artifact_sha256"] = hashlib.sha256(json.dumps(bundle, sort_keys=True).encode()).hexdigest()
    bundle["artifact_signature"] = _signature(bundle)
    path = _artifact_dir() / f"{bundle['version']}.json"
    path.write_text(json.dumps(bundle, indent=2, sort_keys=True), encoding="utf-8")
    return bundle


def bundle_preview_markdown(bundle: dict[str, Any]) -> str:
    """A test-only mock-style response before a bundle is approved."""
    lines = ["## Expert Engine research preview", "", f"Draft bundle: `{bundle['version']}`", "", "This preview shows historical context that can be appended to dashboard AI after approval.", ""]
    for base in bundle.get("baselines", [])[:12]:
        lines.extend([
            f"### {base['metric']} — {base['org_unit_id']} ({'rolling history' if base.get('baseline_type') == 'rolling' else base['season']})",
            f"- Historical median: **{base['median']}**; Q3 warning: **{base['q3_alert']}**; action limit: **{base['action_limit']}**.",
            f"- Evidence: {base['sample_count']} {'rolling observations' if base.get('baseline_type') == 'rolling' else 'same-season observations'}." + (f" Average reporting completeness: **{base['avg_reporting_rate']}%**." if base.get("avg_reporting_rate") is not None else ""),
            "- When a live dashboard value exceeds these thresholds, the approved bundle will add a surveillance warning and recommended verification action.",
            "",
        ])
    return "\n".join(lines)


def list_bundles() -> list[dict[str, Any]]:
    result = []
    for path in sorted(_artifact_dir().glob("research-*.json"), reverse=True):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            result.append({key: data.get(key) for key in ("version", "status", "created_at", "artifact_sha256", "provenance")})
        except (OSError, json.JSONDecodeError):
            continue
    return result


def activate_bundle(version: str) -> dict[str, Any]:
    path = _artifact_dir() / f"{Path(version).name}.json"
    if not path.exists():
        raise ExpertEngineError("Research bundle not found.", 404)
    bundle = json.loads(path.read_text(encoding="utf-8"))
    signature = bundle.pop("artifact_signature", None)
    if not signature or not hmac.compare_digest(signature, _signature(bundle)):
        raise ExpertEngineError("Research bundle signature is invalid.")
    bundle["status"] = "approved"
    bundle["artifact_signature"] = _signature(bundle)
    path.write_text(json.dumps(bundle, indent=2, sort_keys=True), encoding="utf-8")
    (_artifact_dir() / "active.json").write_text(json.dumps(bundle, indent=2, sort_keys=True), encoding="utf-8")
    return bundle


def historical_evidence(context: dict[str, Any]) -> list[dict[str, Any]]:
    """Return explicit metric/org-unit matches, preferring same-season history."""
    config = current_app.config.get("AI_INSIGHTS_CONFIG") or {}
    if not config.get("expert_engine_enabled", True):
        return []
    try:
        bundle = json.loads((_artifact_dir() / "active.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    signature = bundle.pop("artifact_signature", None)
    if not signature or not hmac.compare_digest(signature, _signature(bundle)):
        return []
    matches = []
    for chart in context.get("charts") or []:
        result = chart.get("query_result") or {}
        rows = result.get("sample_rows") or []
        columns = result.get("columns") or []
        for baseline in bundle.get("baselines") or []:
            metric = baseline.get("metric")
            value_col = next((column for column in columns if _normalise(column) == _normalise(metric)), None)
            if not value_col:
                continue
            for row in rows:
                current = _number(row.get(value_col))
                ou = str(row.get("org_unit_id") or row.get("ou") or "").strip()
                season = _season_key(str(row.get("period") or row.get("pe") or ""))
                is_rolling = baseline.get("baseline_type") == "rolling"
                if current is None or not ou or (not is_rolling and season != baseline.get("season")) or ou != baseline.get("org_unit_id"):
                    continue
                if current > baseline["action_limit"]:
                    status, action = "Epidemic action alert", "Verify reporting and initiate the approved surveillance response."
                elif current > baseline["q3_alert"]:
                    status, action = "Surveillance warning", "Verify reporting completeness and increase surveillance."
                else:
                    status, action = "Within historical channel", "Continue routine surveillance."
                matches.append({"metric": metric, "current": current, "baseline": baseline, "status": status, "action": action, "bundle_version": bundle.get("version")})
    return matches[:8]
