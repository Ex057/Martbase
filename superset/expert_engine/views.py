from __future__ import annotations

from urllib.parse import quote

from flask import Blueprint, abort, g, redirect, request

from superset import security_manager
from superset.superset_typing import FlaskResponse
from superset.views.base import BaseSupersetView

expert_frontend_blueprint = Blueprint("expert_frontend", __name__, url_prefix="/superset/expert")
expert_alias_blueprint = Blueprint("expert_alias_frontend", __name__, url_prefix="/expert")


def _shell() -> FlaskResponse:
    user = getattr(g, "user", None)
    if user is None or getattr(user, "is_anonymous", True):
        return redirect(f"/login/?next={quote(request.full_path.rstrip('?'))}")
    if not (security_manager.is_admin() or security_manager.can_access("can_read", "AIManagement")):
        abort(403)
    from superset.extensions import appbuilder

    view = BaseSupersetView()
    view.appbuilder = appbuilder
    return view.render_app_template()


@expert_frontend_blueprint.route("/")
def expert() -> FlaskResponse:
    return _shell()


@expert_alias_blueprint.route("/")
def expert_alias() -> FlaskResponse:
    return _shell()
