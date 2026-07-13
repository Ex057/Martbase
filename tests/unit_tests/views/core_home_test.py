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

from types import SimpleNamespace

from flask import g

from superset.views.authenticated_home import get_authenticated_home_target


def test_configured_authenticated_home_target_prefers_accessible_role_mapping(
    mocker,
    app_context: None,
) -> None:
    g.user = SimpleNamespace(
        roles=[
            SimpleNamespace(name="End user"),
            SimpleNamespace(name="Analytics"),
        ]
    )
    mocker.patch(
        "superset.views.authenticated_home.load_authenticated_home_config",
        return_value={
            "authenticatedHomeMode": "dashboard",
            "authenticatedHomeDashboardId": 42,
            "authenticatedHomeDashboardPath": "/superset/dashboard/99/",
        },
    )
    accessible_dashboard_path = mocker.patch(
        "superset.views.authenticated_home.accessible_dashboard_path",
        side_effect=lambda path: (
            path if path == "/superset/dashboard/42/" else None
        ),
    )

    assert get_authenticated_home_target() == "/superset/dashboard/42/"
    assert accessible_dashboard_path.call_args_list[0].args[0] == "/superset/dashboard/42/"


def test_configured_authenticated_home_target_falls_back_to_default_dashboard(
    mocker,
    app_context: None,
) -> None:
    g.user = SimpleNamespace(roles=[SimpleNamespace(name="End user")])
    mocker.patch(
        "superset.views.authenticated_home.load_authenticated_home_config",
        return_value={
            "authenticatedHomeMode": "dashboard",
            "authenticatedHomeDashboardId": None,
            "authenticatedHomeDashboardPath": "/superset/dashboard/99/",
        },
    )
    mocker.patch(
        "superset.views.authenticated_home.accessible_dashboard_path",
        side_effect=lambda path: (
            "/superset/dashboard/99/" if path == "/superset/dashboard/99/" else None
        ),
    )

    assert get_authenticated_home_target() == "/superset/dashboard/99/"


def test_configured_authenticated_home_target_uses_role_based_dashboard(
    mocker,
    app_context: None,
) -> None:
    """Test that role-based dashboard paths take priority over global settings"""
    g.user = SimpleNamespace(
        roles=[
            SimpleNamespace(name="End user"),
            SimpleNamespace(name="Analytics"),
        ]
    )
    mocker.patch(
        "superset.views.authenticated_home.load_authenticated_home_config",
        return_value={
            "authenticatedHomeMode": "dashboard",
            "authenticatedHomeDashboardId": 50,
            "authenticatedHomeDashboardPath": "/superset/dashboard/99/",
            "authenticatedHomeRoleDashboardPaths": {
                "End user": "/superset/dashboard/100/",
                "Analytics": "/superset/dashboard/200/",
            },
        },
    )
    mocker.patch(
        "superset.views.authenticated_home.accessible_dashboard_path",
        side_effect=lambda path: path if path == "/superset/dashboard/100/" else None,
    )

    result = get_authenticated_home_target()
    assert result == "/superset/dashboard/100/"


def test_configured_authenticated_home_target_role_fallback_to_global(
    mocker,
    app_context: None,
) -> None:
    """Test that if role dashboard is inaccessible, fall back to global"""
    g.user = SimpleNamespace(roles=[SimpleNamespace(name="End user")])
    mocker.patch(
        "superset.views.authenticated_home.load_authenticated_home_config",
        return_value={
            "authenticatedHomeMode": "dashboard",
            "authenticatedHomeDashboardId": 50,
            "authenticatedHomeRoleDashboardPaths": {
                "End user": "/superset/dashboard/999/",  # Not accessible
            },
        },
    )
    mocker.patch(
        "superset.views.authenticated_home.accessible_dashboard_path",
        side_effect=lambda path: (
            "/superset/dashboard/50/" if path == "/superset/dashboard/50/" else None
        ),
    )

    result = get_authenticated_home_target()
    assert result == "/superset/dashboard/50/"
