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
"""Resolution of the CMS-configured landing page for authenticated users."""

from __future__ import annotations

import logging
import re
from typing import Any, cast
from urllib import parse

from flask import g

from superset import db, security_manager
from superset.models.dashboard import Dashboard
from superset.public_page.models import PageLayoutConfig

logger = logging.getLogger(__name__)

PORTAL_LAYOUT_SCOPE = "public_portal"
DASHBOARD_PATH_RE = re.compile(r"^/(?:superset/)?dashboard/(?P<id_or_slug>[^/?#]+)/?")


def load_authenticated_home_config() -> dict[str, Any]:
    layout_config = (
        db.session.query(PageLayoutConfig)
        .filter(PageLayoutConfig.scope == PORTAL_LAYOUT_SCOPE)
        .one_or_none()
    )
    if layout_config is None:
        return {}
    return cast(dict[str, Any], layout_config.get_config() or {})


def normalize_authenticated_dashboard_path(path: Any) -> str:
    from superset.public_page.api import _normalize_internal_dashboard_path

    try:
        return _normalize_internal_dashboard_path(str(path or ""))
    except Exception:  # pylint: disable=broad-except
        return ""


def dashboard_from_path(path: str) -> Dashboard | None:
    match = DASHBOARD_PATH_RE.match(path)
    if not match:
        return None

    id_or_slug = parse.unquote(match.group("id_or_slug")).strip()
    if not id_or_slug:
        return None

    dashboard_query = db.session.query(Dashboard)
    if id_or_slug.isdigit():
        return dashboard_query.filter(Dashboard.id == int(id_or_slug)).one_or_none()
    return dashboard_query.filter(Dashboard.slug == id_or_slug).one_or_none()


def accessible_dashboard_path(path: Any) -> str | None:
    normalized_path = normalize_authenticated_dashboard_path(path)
    if not normalized_path:
        return None

    dashboard = dashboard_from_path(normalized_path)
    if dashboard is None:
        return None

    if security_manager.can_access_dashboard(dashboard):
        return normalized_path
    return None


def get_authenticated_home_target() -> str | None:
    """
    Return the dashboard path the current user's home should resolve to, or None
    when the default welcome page should be rendered.
    """
    config = load_authenticated_home_config()
    home_mode = str(config.get("authenticatedHomeMode") or "welcome").strip()
    if home_mode != "dashboard":
        return None

    # Check role-based dashboard paths first
    role_paths = config.get("authenticatedHomeRoleDashboardPaths", {})
    if role_paths and g.user and hasattr(g.user, "roles"):
        user_role_names = {role.name for role in g.user.roles}

        # Check each role in priority order (first match wins)
        for role_name, dashboard_path in role_paths.items():
            if role_name in user_role_names and dashboard_path:
                if target := accessible_dashboard_path(dashboard_path):
                    return target

    # Fall back to global dashboard ID
    dashboard_id = config.get("authenticatedHomeDashboardId")
    if dashboard_id not in (None, "", 0, "0"):
        if target := accessible_dashboard_path(f"/superset/dashboard/{dashboard_id}/"):
            return target

    # Fall back to global dashboard path
    return accessible_dashboard_path(config.get("authenticatedHomeDashboardPath"))


def get_authenticated_home_target_safe() -> str | None:
    """Same as get_authenticated_home_target, but never raises."""
    user = getattr(g, "user", None)
    if user is None or user.is_anonymous:
        return None
    try:
        return get_authenticated_home_target()
    except Exception:  # pylint: disable=broad-except
        logger.warning("Unable to resolve authenticated home target", exc_info=True)
        return None
