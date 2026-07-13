"""Tests for AI management admin view helpers."""

import tests.dhis2._bootstrap  # noqa: F401 - must be first

from flask import Flask
import pytest
from werkzeug.exceptions import Forbidden

from superset.ai_insights.admin_views import (
    AIManagementView,
    _render_authenticated_shell,
)


def test_ai_frontend_path_respects_application_root():
    app = Flask(__name__)
    app.config["APPLICATION_ROOT"] = "/tenant"

    with app.app_context():
        assert (
            AIManagementView()._frontend_path("/superset/ai-management/")
            == "/tenant/superset/ai-management/"
        )


def test_ai_render_authenticated_shell_requires_permission(mocker):
    app = Flask(__name__)

    with app.test_request_context("/ai-management/"):
        from flask import g

        g.user = type("User", (), {"is_anonymous": False})()
        mocker.patch(
            "superset.ai_insights.admin_views.security_manager.is_admin",
            return_value=False,
        )
        mocker.patch(
            "superset.ai_insights.admin_views.security_manager.can_access",
            return_value=False,
        )

        with pytest.raises(Forbidden):
            _render_authenticated_shell()


def test_ai_render_authenticated_shell_renders_when_permitted(mocker):
    app = Flask(__name__)

    with app.test_request_context("/ai-management/"):
        from flask import g

        g.user = type("User", (), {"is_anonymous": False})()
        mocker.patch(
            "superset.ai_insights.admin_views.security_manager.is_admin",
            return_value=False,
        )
        mocker.patch(
            "superset.ai_insights.admin_views.security_manager.can_access",
            return_value=True,
        )
        render_app_template = mocker.patch(
            "superset.views.base.BaseSupersetView.render_app_template",
            return_value="rendered-shell",
        )

        assert _render_authenticated_shell() == "rendered-shell"
        render_app_template.assert_called_once()


def test_ai_render_authenticated_shell_renders_for_admin_without_ai_permission(
    mocker,
):
    app = Flask(__name__)

    with app.test_request_context("/ai-management/"):
        from flask import g

        g.user = type("User", (), {"is_anonymous": False})()
        mocker.patch(
            "superset.ai_insights.admin_views.security_manager.is_admin",
            return_value=True,
        )
        can_access = mocker.patch(
            "superset.ai_insights.admin_views.security_manager.can_access",
            return_value=False,
        )
        render_app_template = mocker.patch(
            "superset.views.base.BaseSupersetView.render_app_template",
            return_value="rendered-shell",
        )

        assert _render_authenticated_shell() == "rendered-shell"
        can_access.assert_not_called()
        render_app_template.assert_called_once()
