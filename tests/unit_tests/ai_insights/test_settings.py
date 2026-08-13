from __future__ import annotations

from copy import deepcopy

from flask import current_app

from superset import db
from superset.ai_insights.admin_api import AIManagementRestApi
from superset.ai_insights.settings import (
    LOCALAI_DEFAULT_MODEL_ID,
    AIInsightsSettings,
    build_ai_management_payload,
    load_ai_settings_override,
    save_ai_management_settings,
)
from superset.constants import PASSWORD_MASK


def _reset_settings() -> None:
    try:
        AIInsightsSettings.__table__.create(bind=db.session.get_bind(), checkfirst=True)
        db.session.query(AIInsightsSettings).delete()
        db.session.commit()
    except Exception:  # pylint: disable=broad-except
        db.session.rollback()


def test_ai_management_payload_includes_current_openai_catalog(app_context: None) -> None:
    del app_context
    _reset_settings()

    payload = build_ai_management_payload()
    model_ids = [item["id"] for item in payload["model_catalogs"]["openai_text"]]

    assert "gpt-5.4" in model_ids
    assert "gpt-5.4-pro" in model_ids
    assert "gpt-5.4-mini" in model_ids
    assert "gpt-4.1" in model_ids
    assert "o3" in model_ids
    assert "o4-mini" in model_ids


def test_ai_management_payload_includes_cloud_provider_catalogs(
    app_context: None,
) -> None:
    del app_context
    _reset_settings()

    payload = build_ai_management_payload()

    gemini_ids = [item["id"] for item in payload["model_catalogs"]["gemini_text"]]
    anthropic_ids = [
        item["id"] for item in payload["model_catalogs"]["anthropic_text"]
    ]
    deepseek_ids = [
        item["id"] for item in payload["model_catalogs"]["deepseek_text"]
    ]
    preset_ids = {item["id"] for item in payload["provider_presets"]}

    assert "gemini-2.5-flash" in gemini_ids
    assert "claude-sonnet-4-20250514" in anthropic_ids
    assert "deepseek-reasoner" in deepseek_ids
    assert {"gemini", "anthropic", "deepseek"} <= preset_ids


def test_ai_management_payload_defaults_localai_to_qwen_default(
    app_context: None,
) -> None:
    del app_context
    _reset_settings()

    payload = build_ai_management_payload()
    provider = payload["settings"]["providers"]["localai"]

    assert payload["settings"]["default_model"] == LOCALAI_DEFAULT_MODEL_ID
    assert provider["default_model"] == LOCALAI_DEFAULT_MODEL_ID
    assert LOCALAI_DEFAULT_MODEL_ID in provider["models"]


def test_localai_start_separates_runtime_and_dependency_failures(
    app_context: None,
    mocker,
) -> None:
    del app_context

    api = AIManagementRestApi()
    api.base_permissions = ["can_write"]
    mocker.patch.object(current_app.appbuilder.sm, "is_item_public", return_value=False)
    mocker.patch.object(current_app.appbuilder.sm, "has_access", return_value=True)
    captured: dict[str, object] = {}

    def capture_response(status: int, **payload: object) -> dict[str, object]:
        captured["status"] = status
        captured.update(payload)
        return {"status": status, **payload}

    mocker.patch.object(api, "response", side_effect=capture_response)
    mocker.patch.object(
        api,
        "_run_localai_setup_command",
        return_value={
            "returncode": 1,
            "stdout": "",
            "stderr": "failed to listen: listen tcp4 :8080: bind: address already in use",
        },
    )
    mocker.patch.object(api, "_localai_base_url", return_value="http://127.0.0.1:39671")
    mocker.patch.object(api, "_localai_health_check", return_value=False)
    mocker.patch.object(
        api,
        "_check_model_dependencies",
        return_value={
            "ready": False,
            "missing": [
                "hermes-3-llama-3.1-8b-lorablated.Q4_K_M.gguf (base model weights, ~4.6 GB)"
            ],
        },
    )

    response = api.localai_start()
    result = deepcopy(response["result"])

    assert captured["status"] == 400
    assert (
        result["startup_error"]
        == "failed to listen: listen tcp4 :8080: bind: address already in use"
    )
    assert (
        result["dependency_error"]
        == "hermes-3-llama-3.1-8b-lorablated.Q4_K_M.gguf (base model weights, ~4.6 GB)"
    )
    assert result["configured_base_url"] == "http://127.0.0.1:39671"
    assert result["missing_dependencies"] == [
        "hermes-3-llama-3.1-8b-lorablated.Q4_K_M.gguf (base model weights, ~4.6 GB)"
    ]


def test_localai_backend_status_flags_llama_cpp_unavailable_on_intel_mac(
    app_context: None,
    mocker,
) -> None:
    del app_context

    mocker.patch(
        "superset.ai_insights.admin_api.AIManagementRestApi._read_repo_managed_model_yaml",
        return_value="backend: llama-cpp\nparameters:\n  model: hermes.gguf\n",
    )
    mocker.patch("superset.ai_insights.admin_api.platform.system", return_value="Darwin")
    mocker.patch("superset.ai_insights.admin_api.platform.machine", return_value="x86_64")

    status = AIManagementRestApi._localai_backend_status(LOCALAI_DEFAULT_MODEL_ID)

    assert status["backend"] == "llama-cpp"
    assert status["backend_ready"] is False
    assert "Intel macOS runtime" in status["backend_error"]


def test_save_ai_management_settings_persists_and_masks_provider_secret(
    app_context: None,
) -> None:
    del app_context
    _reset_settings()

    result = save_ai_management_settings(
        {
            "enabled": True,
            "default_provider": "openai",
            "default_model": "gpt-5.4",
            "providers": {
                "openai": {
                    "enabled": True,
                    "type": "openai",
                    "label": "OpenAI Cloud",
                    "api_key": "super-secret-key",
                    "models": ["gpt-5.4", "gpt-4.1"],
                    "default_model": "gpt-5.4",
                }
            },
        }
    )

    override = load_ai_settings_override()

    assert override["providers"]["openai"]["api_key"] == "super-secret-key"
    assert result["settings"]["providers"]["openai"]["api_key"] == PASSWORD_MASK
    assert result["settings"]["providers"]["openai"]["has_api_key"] is True
