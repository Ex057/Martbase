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

# pylint: disable=invalid-name, unused-argument, redefined-outer-name

import json  # noqa: TID251
from unittest.mock import call, MagicMock

import pytest
from flask_appbuilder.security.sqla.models import Role, User
from pytest_mock import MockerFixture

from superset.common.query_object import QueryObject
from superset.connectors.sqla.models import Database, SqlaTable
from superset.exceptions import SupersetSecurityException
from superset.extensions import appbuilder
from superset.models.slice import Slice
from superset.security.manager import (
    PRODUCTION_CUSTOM_ROLE_SPECS,
    query_context_modified,
    SupersetSecurityManager,
)
from superset.sql.parse import Table
from superset.superset_typing import AdhocColumn, AdhocMetric
from superset.utils.core import DatasourceName, override_user


def test_security_manager(app_context: None) -> None:
    """
    Test that the security manager can be built.
    """
    sm = SupersetSecurityManager(appbuilder)
    assert sm


@pytest.fixture
def stored_metrics() -> list[AdhocMetric]:
    """
    Return a list of metrics.
    """
    return [
        {
            "column": None,
            "expressionType": "SQL",
            "hasCustomLabel": False,
            "label": "COUNT(*) + 1",
            "sqlExpression": "COUNT(*) + 1",
        },
    ]


@pytest.fixture
def stored_columns() -> list[AdhocColumn]:
    """
    Return a list of columns.
    """
    return [
        {
            "label": "My column",
            "sqlExpression": "UPPER(name)",
        },
    ]


def test_raise_for_access_guest_user_ok(
    mocker: MockerFixture,
    app_context: None,
    stored_metrics: list[AdhocMetric],
    stored_columns: list[AdhocColumn],
) -> None:
    """
    Test that guest user can submit an unmodified chart payload.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
        "columns": stored_columns,
    }

    query_context.form_data = {
        "slice_id": 42,
        "metrics": stored_metrics,
        "columns": stored_columns,
    }
    query_context.queries = [QueryObject(metrics=stored_metrics)]  # type: ignore
    sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_ok_subset(
    mocker: MockerFixture,
    app_context: None,
    stored_metrics: list[AdhocMetric],
    stored_columns: list[AdhocColumn],
) -> None:
    """
    Test that guest user can submit a request of a subset of the metrics/columns.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
        "columns": stored_columns,
    }

    query_context.form_data = {
        "slice_id": 42,
        "metrics": [],
        "columns": [],
    }
    query_context.queries = [QueryObject(metrics=stored_metrics)]  # type: ignore
    sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_tampered_id(
    mocker: MockerFixture,
    app_context: None,
    stored_metrics: list[AdhocMetric],
) -> None:
    """
    Test that guest user cannot modify the chart ID.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    query_context.form_data = {
        "slice_id": 43,
        "metrics": stored_metrics,
    }
    query_context.queries = [QueryObject(metrics=stored_metrics)]  # type: ignore
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_tampered_form_data_metrics(
    mocker: MockerFixture,
    app_context: None,
    stored_metrics: list[AdhocMetric],
) -> None:
    """
    Test that guest user cannot modify metrics in the form data.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    tampered_metrics = [
        {
            "column": None,
            "expressionType": "SQL",
            "hasCustomLabel": False,
            "label": "COUNT(*) + 2",
            "sqlExpression": "COUNT(*) + 2",
        }
    ]

    query_context.form_data = {
        "slice_id": 42,
        "metrics": tampered_metrics,
    }
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_tampered_form_data_columns(
    mocker: MockerFixture,
    app_context: None,
    stored_columns: list[AdhocColumn],
) -> None:
    """
    Test that guest user cannot modify columns in the form data.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "columns": stored_columns,
    }

    tampered_columns = [
        {
            "label": "My column",
            "sqlExpression": "list_secret()",
            "expressionType": "SQL",
        },
    ]

    query_context.form_data = {
        "slice_id": 42,
        "columns": tampered_columns,
    }
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_sync_custom_production_roles_adds_expected_permissions(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    sm = SupersetSecurityManager(appbuilder)

    def make_pvm(permission_name: str, view_menu_name: str) -> MagicMock:
        pvm = MagicMock()
        pvm.permission.name = permission_name
        pvm.view_menu.name = view_menu_name
        return pvm

    # The set of PVMs that actually exist in a synced Superset instance. Note
    # there is deliberately no ("can_list", "AIManagement"), ("can_list",
    # "TableModelView") or ("can_list", "DatabaseView") here: those views set a
    # class_permission_name and use MODEL_VIEW_RW_METHOD_PERMISSION_MAP, which
    # maps "list" -> "read". Referencing them is a silent no-op, which is the
    # bug KNOWN_PVMS + test_custom_role_specs_reference_real_pvms guard against.
    KNOWN_PVMS = {
        ("can_read", "AIManagement"),
        ("can_write", "AIManagement"),
        ("menu_access", "AI Management"),
        ("can_read", "Dataset"),
        ("can_write", "Dataset"),
        ("menu_access", "Datasets"),
        ("menu_access", "Databases"),
        ("menu_access", "Data"),
        ("can_list", "DHIS2AdminView"),
        ("can_sqllab", "Superset"),
        ("can_sqllab_history", "Superset"),
        ("can_explore", "Superset"),
        ("can_share_chart", "Superset"),
        ("can_share_dashboard", "Superset"),
        ("can_write", "Chart"),
        ("can_write", "Dashboard"),
        ("can_view_query", "Dashboard"),
        ("can_view_chart_as_table", "Dashboard"),
        ("menu_access", "Charts"),
        ("all_datasource_access", "all_datasource_access"),
        ("can_dhis2_metadata", "Database"),
        ("cms.pages.view", "CMS"),
        ("cms.pages.create", "CMS"),
        ("cms.pages.edit", "CMS"),
        ("cms.pages.delete", "CMS"),
        ("cms.pages.publish", "CMS"),
        ("cms.media.manage", "CMS"),
        ("cms.menus.manage", "CMS"),
        ("cms.charts.embed", "CMS"),
        ("cms.layout.manage", "CMS"),
        ("cms.themes.manage", "CMS"),
        ("cms.templates.manage", "CMS"),
        ("cms.styles.manage", "CMS"),
    }

    # These mirror what Alpha and Gamma actually hold in a synced instance, so
    # that revokes are genuinely exercised — copy_role resets each custom role
    # to its base, so a permission missing here would make its revoke a no-op
    # and the corresponding assertion vacuous.
    base_alpha_pvms = [
        make_pvm("menu_access", "Data"),
        make_pvm("menu_access", "Databases"),
        make_pvm("menu_access", "Datasets"),
        make_pvm("menu_access", "AI Management"),
        make_pvm("can_read", "Dataset"),
        make_pvm("can_write", "Dataset"),
        make_pvm("can_read", "AIManagement"),
        make_pvm("can_write", "AIManagement"),
        make_pvm("can_list", "DHIS2AdminView"),
        # DHIS2AdminView is not in ADMIN_ONLY_VIEW_MENUS, so Alpha inherits
        # every permission under it — including instance management.
        make_pvm("can_instances", "DHIS2AdminView"),
    ]
    base_gamma_pvms = [
        make_pvm("can_read", "Dashboard"),
        make_pvm("menu_access", "Databases"),
        make_pvm("menu_access", "Datasets"),
        make_pvm("menu_access", "AI Management"),
        # Gamma keeps can_read on Dataset so dashboard charts resolve their
        # datasource; the End user spec must not revoke it.
        make_pvm("can_read", "Dataset"),
        make_pvm("can_read", "AIManagement"),
        make_pvm("can_write", "AIManagement"),
        make_pvm("can_sqllab", "Superset"),
    ]
    ai_read = make_pvm("can_read", "AIManagement")
    ai_write = make_pvm("can_write", "AIManagement")
    ai_menu = make_pvm("menu_access", "AI Management")
    cms_view = make_pvm("cms.pages.view", "CMS")

    role_map = {
        "Data Management": MagicMock(permissions=list(base_alpha_pvms)),
        "Analytics": MagicMock(
            permissions=list(base_alpha_pvms) + [ai_read, ai_write, ai_menu]
        ),
        "End user": MagicMock(
            permissions=list(base_gamma_pvms)
            + [ai_read, ai_write, ai_menu, cms_view]
        ),
    }

    def copy_role(role_from_name: str, role_to_name: str, merge: bool = True) -> None:
        del merge
        source = base_alpha_pvms if role_from_name == "Alpha" else base_gamma_pvms
        role_map[role_to_name].permissions = list(source)

    def find_pvm(permission_name: str, view_menu_name: str) -> MagicMock | None:
        """Mirror FAB: return None for a pair that was never registered."""
        if (permission_name, view_menu_name) not in KNOWN_PVMS:
            return None
        return make_pvm(permission_name, view_menu_name)

    copy_role_mock = mocker.patch.object(sm, "copy_role", side_effect=copy_role)
    mocker.patch.object(sm, "find_role", side_effect=lambda name: role_map.get(name))
    mocker.patch.object(
        sm,
        "find_permission_view_menu",
        side_effect=find_pvm,
    )

    sm.sync_custom_production_roles()

    copy_role_mock.assert_has_calls(
        [
            call(spec.base_role, spec.name, merge=False)
            for spec in PRODUCTION_CUSTOM_ROLE_SPECS
        ]
    )
    assert {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["Data Management"].permissions
    } >= {
        # AI Management: API/view access plus the nav item.
        ("can_read", "AIManagement"),
        ("can_write", "AIManagement"),
        ("menu_access", "AI Management"),
        # Datasets: model access plus the nav item.
        ("can_read", "Dataset"),
        ("can_write", "Dataset"),
        ("menu_access", "Datasets"),
        ("can_list", "DHIS2AdminView"),
    }
    # Data Management sees the DHIS2 workspace but must not manage instances.
    assert ("can_instances", "DHIS2AdminView") not in {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["Data Management"].permissions
    }

    # Analytics gets neither AI Management nor the Datasets nav item, but keeps
    # can_read on Dataset so its charts and dashboards still work.
    analytics_pvms = {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["Analytics"].permissions
    }
    assert ("can_read", "AIManagement") not in analytics_pvms
    assert ("menu_access", "AI Management") not in analytics_pvms
    assert ("can_write", "Dataset") not in analytics_pvms
    assert ("menu_access", "Datasets") not in analytics_pvms
    assert ("can_read", "Dataset") in analytics_pvms

    end_user_pvms = {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["End user"].permissions
    }
    assert ("can_read", "AIManagement") not in end_user_pvms
    assert ("menu_access", "AI Management") not in end_user_pvms
    assert ("menu_access", "Databases") not in end_user_pvms
    assert ("menu_access", "Datasets") not in end_user_pvms
    # ...but dashboard charts still need to resolve their datasource, so the
    # Datasets nav item is hidden via menu_access without touching can_read.
    assert ("can_read", "Dataset") in end_user_pvms
    assert ("can_sqllab", "Superset") not in {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["End user"].permissions
    }
    assert ("cms.pages.view", "CMS") not in {
        (pvm.permission.name, pvm.view_menu.name)
        for pvm in role_map["End user"].permissions
    }


def test_custom_role_specs_do_not_reference_can_list_on_rw_mapped_views() -> None:
    """
    Guard against grants that are silently skipped at sync time.

    sync_custom_production_roles looks each (permission, view_menu) pair up with
    find_permission_view_menu and skips it when the lookup returns None — no
    warning, no error. So referencing a permission that is never registered
    grants nothing while looking correct in review.

    Views that set method_permission_name = MODEL_VIEW_RW_METHOD_PERMISSION_MAP
    map "list" -> "read", so they only ever register can_read/can_write.
    ("can_list", "AIManagement") and ("can_list", "TableModelView") were exactly
    this bug: the Data Management role appeared to grant AI Management and
    Datasets while the nav gates checked permissions that could never exist.
    """
    rw_mapped_view_menus = {
        "AIManagement",
        "TableModelView",
        "DatabaseView",
        "Dataset",
        "Chart",
        "Dashboard",
    }

    offenders = [
        (spec.name, permission_name, view_menu_name)
        for spec in PRODUCTION_CUSTOM_ROLE_SPECS
        for permission_name, view_menu_name in spec.grant + spec.revoke
        if permission_name == "can_list" and view_menu_name in rw_mapped_view_menus
    ]

    assert not offenders, (
        "Role specs reference permissions that are never registered, so they are "
        f"silently skipped at sync time: {offenders}. Use can_read/can_write for "
        "RW-mapped model views, or menu_access to gate a nav item."
    )


def test_raise_for_access_guest_user_tampered_form_data_groupby(
    mocker: MockerFixture,
    app_context: None,
    stored_columns: list[AdhocColumn],
) -> None:
    """
    Test that guest user cannot modify groupby in the form data.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "groupby": stored_columns,
    }

    tampered_columns = [
        {
            "label": "My column",
            "sqlExpression": "list_secret()",
            "expressionType": "SQL",
        },
    ]

    query_context.form_data = {
        "slice_id": 42,
        "columns": tampered_columns,
    }
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_tampered_queries_metrics(
    mocker: MockerFixture,
    app_context: None,
    stored_metrics: list[AdhocMetric],
) -> None:
    """
    Test that guest user cannot modify metrics in the queries.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    tampered_metrics = [
        {
            "column": None,
            "expressionType": "SQL",
            "hasCustomLabel": False,
            "label": "COUNT(*) + 2",
            "sqlExpression": "COUNT(*) + 2",
        }
    ]

    query_context.form_data = {
        "slice_id": 42,
        "metrics": stored_metrics,
    }
    query_context.queries = [QueryObject(metrics=tampered_metrics)]  # type: ignore
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_raise_for_access_guest_user_tampered_queries_columns(
    mocker: MockerFixture,
    app_context: None,
    stored_columns: list[AdhocColumn],
) -> None:
    """
    Test that guest user cannot modify columns in the queries.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "is_guest_user", return_value=True)
    mocker.patch.object(sm, "can_access", return_value=True)

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "columns": stored_columns,
    }

    tampered_columns = [
        {
            "label": "My column",
            "sqlExpression": "list_secret()",
            "expressionType": "SQL",
        }
    ]

    query_context.form_data = {
        "slice_id": 42,
        "columns": stored_columns,
    }
    query_context.queries = [QueryObject(metrics=tampered_columns)]  # type: ignore
    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(query_context=query_context)


def test_raise_for_access_query_default_schema(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    """
    Test that the DB default schema is used in non-qualified table names.

    For example, in Postgres, for the following query:

        > SELECT * FROM foo;

    We should check that the user has access to the `public` schema, regardless of the
    schema set in the query.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "can_access_database", return_value=False)
    mocker.patch.object(sm, "get_schema_perm", return_value="[PostgreSQL].[public]")
    mocker.patch.object(sm, "is_guest_user", return_value=False)
    SqlaTable = mocker.patch("superset.connectors.sqla.models.SqlaTable")  # noqa: N806
    SqlaTable.query_datasources_by_name.return_value = []

    database = mocker.MagicMock()
    database.get_default_catalog.return_value = None
    database.get_default_schema_for_query.return_value = "public"
    query = mocker.MagicMock()
    query.catalog = None
    query.database = database
    query.sql = "SELECT * FROM ab_user"

    # user has access to `public` schema
    mocker.patch.object(sm, "can_access", return_value=True)
    assert (
        sm.raise_for_access(  # type: ignore
            database=None,
            datasource=None,
            query=query,
            query_context=None,
            table=None,
            viz=None,
        )
        is None
    )
    sm.can_access.assert_called_with("schema_access", "[PostgreSQL].[public]")  # type: ignore

    # user has only access to `secret` schema
    mocker.patch.object(sm, "can_access", return_value=False)
    with pytest.raises(SupersetSecurityException) as excinfo:
        sm.raise_for_access(
            database=None,
            datasource=None,
            query=query,
            query_context=None,
            table=None,
            viz=None,
        )
    assert (
        str(excinfo.value)
        == """You need access to the following tables: `public.ab_user`,
            `all_database_access` or `all_datasource_access` permission"""
    )


def test_raise_for_access_jinja_sql(mocker: MockerFixture, app_context: None) -> None:
    """
    Test that Jinja gets rendered to SQL.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "can_access_database", return_value=False)
    mocker.patch.object(sm, "get_schema_perm", return_value="[PostgreSQL].[public]")
    mocker.patch.object(sm, "can_access", return_value=False)
    mocker.patch.object(sm, "is_guest_user", return_value=False)
    get_table_access_error_object = mocker.patch.object(
        sm, "get_table_access_error_object"
    )
    SqlaTable = mocker.patch("superset.connectors.sqla.models.SqlaTable")  # noqa: N806
    SqlaTable.query_datasources_by_name.return_value = []

    database = mocker.MagicMock()
    database.get_default_catalog.return_value = None
    database.get_default_schema_for_query.return_value = "public"
    query = mocker.MagicMock()
    query.catalog = None
    query.database = database
    query.sql = "SELECT * FROM {% if True %}ab_user{% endif %} WHERE 1=1"

    with pytest.raises(SupersetSecurityException):
        sm.raise_for_access(
            database=None,
            datasource=None,
            query=query,
            query_context=None,
            table=None,
            viz=None,
        )

    get_table_access_error_object.assert_called_with({Table("ab_user", "public", None)})


def test_raise_for_access_chart_for_datasource_permission(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    """
    Test that the security manager can raise an exception for chart access,
    when the user does not have access to the chart datasource
    """
    sm = SupersetSecurityManager(appbuilder)
    session = sm.session

    engine = session.get_bind()
    Slice.metadata.create_all(engine)  # pylint: disable=no-member

    alpha = User(
        first_name="Alice",
        last_name="Doe",
        email="adoe@example.org",
        username="admin",
        roles=[Role(name="Alpha")],
    )

    dataset = SqlaTable(
        table_name="test_table",
        metrics=[],
        main_dttm_col=None,
        database=Database(database_name="my_database", sqlalchemy_uri="sqlite://"),
    )
    session.add(dataset)
    session.flush()

    slice = Slice(
        id=1,
        datasource_id=dataset.id,
        datasource_type="table",
        datasource_name="tmp_perm_table",
        slice_name="slice_name",
    )
    session.add(slice)
    session.flush()

    mocker.patch.object(sm, "can_access_datasource", return_value=False)
    with override_user(alpha):
        with pytest.raises(SupersetSecurityException) as excinfo:
            sm.raise_for_access(
                chart=slice,
            )
        assert str(excinfo.value) == "You don't have access to this chart."

    mocker.patch.object(sm, "can_access_datasource", return_value=True)
    with override_user(alpha):
        sm.raise_for_access(
            chart=slice,
        )


def test_raise_for_access_chart_on_admin(
    app_context: None,
) -> None:
    """
    Test that the security manager can raise an exception for chart access,
    when the user does not have access to the chart datasource
    """
    from flask_appbuilder.security.sqla.models import Role, User

    from superset.models.slice import Slice
    from superset.utils.core import override_user

    sm = SupersetSecurityManager(appbuilder)
    session = sm.session

    engine = session.get_bind()
    Slice.metadata.create_all(engine)  # pylint: disable=no-member

    admin = User(
        first_name="Alice",
        last_name="Doe",
        email="adoe@example.org",
        username="admin",
        roles=[Role(name="Admin")],
    )

    slice = Slice(
        id=1,
        datasource_id=1,
        datasource_type="table",
        datasource_name="tmp_perm_table",
        slice_name="slice_name",
    )
    session.add(slice)
    session.flush()

    with override_user(admin):
        sm.raise_for_access(
            chart=slice,
        )


def test_raise_for_access_chart_owner(
    app_context: None,
) -> None:
    """
    Test that the security manager can raise an exception for chart access,
    when the user does not have access to the chart datasource
    """
    sm = SupersetSecurityManager(appbuilder)
    session = sm.session

    engine = session.get_bind()
    Slice.metadata.create_all(engine)  # pylint: disable=no-member

    # Check if Alpha role already exists
    alpha_role = session.query(Role).filter_by(name="Alpha").first()
    if not alpha_role:
        alpha_role = Role(name="Alpha")
        session.add(alpha_role)
        session.commit()

    # Check if user already exists
    alpha = session.query(User).filter_by(username="test_chart_owner_user").first()
    if not alpha:
        alpha = User(
            first_name="Alice",
            last_name="Doe",
            email="adoe@example.org",
            username="test_chart_owner_user",
            roles=[alpha_role],
        )
        session.add(alpha)
        session.commit()
    else:
        # Ensure the user has the Alpha role
        if alpha_role not in alpha.roles:
            alpha.roles.append(alpha_role)
            session.commit()

    slice = Slice(
        id=1,
        datasource_id=1,
        datasource_type="table",
        datasource_name="tmp_perm_table",
        slice_name="slice_name",
        owners=[alpha],
    )
    session.add(slice)

    with override_user(alpha):
        sm.raise_for_access(
            chart=slice,
        )


def test_query_context_modified(
    mocker: MockerFixture,
    stored_metrics: list[AdhocMetric],
) -> None:
    """
    Test the `query_context_modified` function.

    The function is used to ensure guest users are not modifying the request payload on
    embedded dashboard, preventing users from modifying it to access metrics different
    from the ones stored in dashboard charts.
    """
    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    query_context.form_data = {
        "slice_id": 42,
        "metrics": stored_metrics,
    }
    query_context.queries = [QueryObject(metrics=stored_metrics)]  # type: ignore
    assert not query_context_modified(query_context)


def test_query_context_modified_tampered(
    mocker: MockerFixture,
    stored_metrics: list[AdhocMetric],
) -> None:
    """
    Test the `query_context_modified` function when the request is tampered with.

    The function is used to ensure guest users are not modifying the request payload on
    embedded dashboard, preventing users from modifying it to access metrics different
    from the ones stored in dashboard charts.
    """
    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    tampered_metrics = [
        {
            "column": None,
            "expressionType": "SQL",
            "hasCustomLabel": False,
            "label": "COUNT(*) + 2",
            "sqlExpression": "COUNT(*) + 2",
        }
    ]

    query_context.form_data = {
        "slice_id": 42,
        "metrics": tampered_metrics,
    }
    query_context.queries = [QueryObject(metrics=tampered_metrics)]  # type: ignore
    assert query_context_modified(query_context)


def test_query_context_modified_native_filter(mocker: MockerFixture) -> None:
    """
    Test the `query_context_modified` function with a native filter request.

    A native filter request has no chart (slice) associated with it.
    """
    query_context = mocker.MagicMock()
    query_context.slice_ = None

    assert not query_context_modified(query_context)


def test_query_context_modified_mixed_chart(mocker: MockerFixture) -> None:
    """
    Test the `query_context_modified` function for a mixed chart request.

    The metrics in the mixed chart are a nested dictionary (due to `columns`), and need
    to be serialized to JSON with the keys sorted in order to compare the request
    metrics with the chart metrics.
    """
    stored_metrics = [
        {
            "optionName": "metric_vgops097wej_g8uff99zhk7",
            "label": "AVG(num)",
            "expressionType": "SIMPLE",
            "column": {"column_name": "num", "type": "BIGINT(20)"},
            "aggregate": "AVG",
        }
    ]
    # different order (remember, dicts have order!)
    requested_metrics = [
        {
            "aggregate": "AVG",
            "column": {"column_name": "num", "type": "BIGINT(20)"},
            "expressionType": "SIMPLE",
            "label": "AVG(num)",
            "optionName": "metric_vgops097wej_g8uff99zhk7",
        }
    ]

    query_context = mocker.MagicMock()
    query_context.slice_.id = 42
    query_context.slice_.query_context = None
    query_context.slice_.params_dict = {
        "metrics": stored_metrics,
    }

    query_context.form_data = {
        "slice_id": 42,
        "metrics": requested_metrics,
    }
    query_context.queries = [QueryObject(metrics=requested_metrics)]  # type: ignore
    assert not query_context_modified(query_context)


def test_query_context_modified_sankey_tampered(mocker: MockerFixture) -> None:
    """
    Test the `query_context_modified` function for a sankey chart request.
    """
    query_context = mocker.MagicMock()
    query_context.queries = [
        QueryObject(
            apply_fetch_values_predicate=False,
            columns=["bot_id", "channel_id"],
            extras={"having": "", "where": ""},
            filter=[
                {
                    "col": "bot_profile__updated",
                    "op": "TEMPORAL_RANGE",
                    "val": "No filter",
                }
            ],
            from_dttm=None,
            granularity=None,
            inner_from_dttm=None,
            inner_to_dttm=None,
            is_rowcount=False,
            is_timeseries=False,
            metrics=["count"],
            order_desc=True,
            orderby=[],
            row_limit=10000,
            row_offset=0,
            series_columns=[],
            series_limit=0,
            series_limit_metric=None,
            time_shift=None,
            to_dttm=None,
        ),
    ]
    query_context.form_data = {
        "datasource": "12__table",
        "viz_type": "sankey_v2",
        "slice_id": 97,
        "url_params": {},
        "source": "bot_id",
        "target": "channel_id",
        "metric": "count",
        "adhoc_filters": [
            {
                "clause": "WHERE",
                "comparator": "No filter",
                "expressionType": "SIMPLE",
                "operator": "TEMPORAL_RANGE",
                "subject": "bot_profile__updated",
            }
        ],
        "row_limit": 10000,
        "color_scheme": "supersetColors",
        "dashboards": [11],
        "extra_form_data": {},
        "label_colors": {},
        "shared_label_colors": [],
        "map_label_colors": {},
        "extra_filters": [],
        "dashboardId": 11,
        "force": False,
        "result_format": "json",
        "result_type": "full",
    }
    query_context.slice_.id = 97
    query_context.slice_.params_dict = {
        "datasource": "12__table",
        "viz_type": "sankey_v2",
        "slice_id": 97,
        "source": "bot_id",
        "target": "channel_id",
        "metric": "count",
        "adhoc_filters": [
            {
                "clause": "WHERE",
                "comparator": "No filter",
                "expressionType": "SIMPLE",
                "operator": "TEMPORAL_RANGE",
                "subject": "bot_profile__updated",
            }
        ],
        "row_limit": 10000,
        "color_scheme": "supersetColors",
        "extra_form_data": {},
        "dashboards": [11],
    }
    query_context.slice_.query_context = json.dumps(
        {
            "datasource": {"id": 12, "type": "table"},
            "force": False,
            "queries": [
                {
                    "filters": [
                        {
                            "col": "bot_profile__updated",
                            "op": "TEMPORAL_RANGE",
                            "val": "No filter",
                        }
                    ],
                    "extras": {"having": "", "where": ""},
                    "applied_time_extras": {},
                    "columns": [],
                    "metrics": ["count"],
                    "annotation_layers": [],
                    "row_limit": 10000,
                    "series_limit": 0,
                    "order_desc": True,
                    "url_params": {},
                    "custom_params": {},
                    "custom_form_data": {},
                    "groupby": ["bot_id", "channel_id"],
                }
            ],
            "form_data": {
                "datasource": "12__table",
                "viz_type": "sankey_v2",
                "slice_id": 97,
                "source": "bot_id",
                "target": "channel_id",
                "metric": "count",
                "adhoc_filters": [
                    {
                        "clause": "WHERE",
                        "comparator": "No filter",
                        "expressionType": "SIMPLE",
                        "operator": "TEMPORAL_RANGE",
                        "subject": "bot_profile__updated",
                    }
                ],
                "row_limit": 10000,
                "color_scheme": "supersetColors",
                "extra_form_data": {},
                "dashboards": [11],
                "force": False,
                "result_format": "json",
                "result_type": "full",
            },
            "result_format": "json",
            "result_type": "full",
        }
    )
    assert not query_context_modified(query_context)


def test_query_context_modified_orderby(mocker: MockerFixture) -> None:
    """
    Test the `query_context_modified` function when the ORDER BY is modified.
    """
    tampered_groupby: AdhocMetric = {
        "aggregate": "",
        "column": None,
        "expressionType": "SQL",
        "hasCustomLabel": False,
        "label": "random()",
        "sqlExpression": "random()",
    }

    query_context = mocker.MagicMock()
    query_context.queries = [
        QueryObject(
            apply_fetch_values_predicate=False,
            columns=["gender"],
            extras={"having": "", "where": ""},
            filter=[{"col": "ds", "op": "TEMPORAL_RANGE", "val": "No filter"}],
            from_dttm=None,
            granularity=None,
            inner_from_dttm=None,
            inner_to_dttm=None,
            is_rowcount=False,
            is_timeseries=False,
            metrics=["count"],
            order_desc=True,
            orderby=[(tampered_groupby, False)],
            row_limit=1000,
            row_offset=0,
            series_columns=[],
            series_limit=0,
            series_limit_metric=tampered_groupby,
            time_shift=None,
            to_dttm=None,
        ),
    ]
    query_context.form_data = {
        "datasource": "2__table",
        "viz_type": "table",
        "slice_id": 101,
        "url_params": {
            "datasource_id": "2",
            "datasource_type": "table",
            "save_action": "saveas",
            "slice_id": "101",
        },
        "query_mode": "aggregate",
        "groupby": ["gender"],
        "time_grain_sqla": "P1D",
        "temporal_columns_lookup": {"ds": True},
        "metrics": ["count"],
        "all_columns": [],
        "percent_metrics": [],
        "adhoc_filters": [
            {
                "clause": "WHERE",
                "comparator": "No filter",
                "expressionType": "SIMPLE",
                "operator": "TEMPORAL_RANGE",
                "subject": "ds",
            }
        ],
        "timeseries_limit_metric": {
            "aggregate": None,
            "column": None,
            "datasourceWarning": False,
            "expressionType": "SQL",
            "hasCustomLabel": False,
            "label": "random()",
            "optionName": "metric_3kwbghgzkv9_wz84h9j1p5d",
            "sqlExpression": "random()",
        },
        "order_by_cols": [],
        "row_limit": 1000,
        "server_page_length": 10,
        "order_desc": True,
        "table_timestamp_format": "smart_date",
        "allow_render_html": True,
        "show_cell_bars": True,
        "color_pn": True,
        "comparison_color_scheme": "Green",
        "comparison_type": "values",
        "extra_form_data": {},
        "force": False,
        "result_format": "json",
        "result_type": "full",
    }
    query_context.slice_.id = 101
    query_context.slice_.params_dict = {
        "datasource": "2__table",
        "viz_type": "table",
        "query_mode": "aggregate",
        "groupby": ["gender"],
        "time_grain_sqla": "P1D",
        "temporal_columns_lookup": {"ds": True},
        "metrics": ["count"],
        "all_columns": [],
        "percent_metrics": [],
        "adhoc_filters": [
            {
                "clause": "WHERE",
                "subject": "ds",
                "operator": "TEMPORAL_RANGE",
                "comparator": "No filter",
                "expressionType": "SIMPLE",
            }
        ],
        "order_by_cols": [],
        "row_limit": 1000,
        "server_page_length": 10,
        "order_desc": True,
        "table_timestamp_format": "smart_date",
        "allow_render_html": True,
        "show_cell_bars": True,
        "color_pn": True,
        "comparison_color_scheme": "Green",
        "comparison_type": "values",
        "extra_form_data": {},
        "dashboards": [],
    }
    query_context.slice_.query_context = json.dumps(
        {
            "datasource": {"id": 2, "type": "table"},
            "force": False,
            "queries": [
                {
                    "filters": [
                        {"col": "ds", "op": "TEMPORAL_RANGE", "val": "No filter"}
                    ],
                    "extras": {"having": "", "where": ""},
                    "applied_time_extras": {},
                    "columns": ["gender"],
                    "metrics": ["count"],
                    "orderby": [],
                    "annotation_layers": [],
                    "row_limit": 1000,
                    "series_limit": 0,
                    "order_desc": True,
                    "url_params": {},
                    "custom_params": {},
                    "custom_form_data": {},
                    "post_processing": [],
                    "time_offsets": [],
                }
            ],
            "form_data": {
                "datasource": "2__table",
                "viz_type": "table",
                "query_mode": "aggregate",
                "groupby": ["gender"],
                "time_grain_sqla": "P1D",
                "temporal_columns_lookup": {"ds": True},
                "metrics": ["count"],
                "all_columns": [],
                "percent_metrics": [],
                "adhoc_filters": [
                    {
                        "clause": "WHERE",
                        "subject": "ds",
                        "operator": "TEMPORAL_RANGE",
                        "comparator": "No filter",
                        "expressionType": "SIMPLE",
                    }
                ],
                "order_by_cols": [],
                "row_limit": 1000,
                "server_page_length": 10,
                "order_desc": True,
                "table_timestamp_format": "smart_date",
                "allow_render_html": True,
                "show_cell_bars": True,
                "color_pn": True,
                "comparison_color_scheme": "Green",
                "comparison_type": "values",
                "extra_form_data": {},
                "dashboards": [],
                "force": False,
                "result_format": "json",
                "result_type": "full",
            },
            "result_format": "json",
            "result_type": "full",
        }
    )
    assert query_context_modified(query_context)


def test_get_catalog_perm() -> None:
    """
    Test the `get_catalog_perm` method.
    """
    sm = SupersetSecurityManager(appbuilder)

    assert sm.get_catalog_perm("my_db", None) is None
    assert sm.get_catalog_perm("my_db", "my_catalog") == "[my_db].[my_catalog]"


def test_get_schema_perm() -> None:
    """
    Test the `get_schema_perm` method.
    """
    sm = SupersetSecurityManager(appbuilder)

    assert sm.get_schema_perm("my_db", None, "my_schema") == "[my_db].[my_schema]"
    assert (
        sm.get_schema_perm("my_db", "my_catalog", "my_schema")
        == "[my_db].[my_catalog].[my_schema]"
    )
    assert sm.get_schema_perm("my_db", None, None) is None
    assert sm.get_schema_perm("my_db", "my_catalog", None) is None


def test_raise_for_access_catalog(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    """
    Test catalog-level permissions.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "can_access_database", return_value=False)
    mocker.patch.object(
        sm,
        "get_catalog_perm",
        return_value="[PostgreSQL].[db1]",
    )
    mocker.patch.object(sm, "is_guest_user", return_value=False)
    SqlaTable = mocker.patch("superset.connectors.sqla.models.SqlaTable")  # noqa: N806
    SqlaTable.query_datasources_by_name.return_value = []

    database = mocker.MagicMock()
    database.get_default_catalog.return_value = "db1"
    database.get_default_schema_for_query.return_value = "public"
    query = mocker.MagicMock()
    query.catalog = "db1"
    query.database = database
    query.sql = "SELECT * FROM ab_user"

    can_access = mocker.patch.object(sm, "can_access", return_value=True)
    sm.raise_for_access(query=query)
    can_access.assert_called_with("catalog_access", "[PostgreSQL].[db1]")

    mocker.patch.object(sm, "can_access", return_value=False)
    with pytest.raises(SupersetSecurityException) as excinfo:
        sm.raise_for_access(query=query)
    assert (
        str(excinfo.value)
        == """You need access to the following tables: `db1.public.ab_user`,
            `all_database_access` or `all_datasource_access` permission"""
    )

    query.sql = "SELECT * FROM db2.public.ab_user"
    with pytest.raises(SupersetSecurityException) as excinfo:
        sm.raise_for_access(query=query)
    assert (
        str(excinfo.value)
        == """You need access to the following tables: `db2.public.ab_user`,
            `all_database_access` or `all_datasource_access` permission"""
    )


def test_get_datasources_accessible_by_user_schema_access(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    """
    Test that `get_datasources_accessible_by_user` works with schema permissions.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "can_access_database", return_value=False)

    database = mocker.MagicMock()
    database.database_name = "db1"
    database.get_default_catalog.return_value = "catalog2"

    # False for catalog_access, True for schema_access
    can_access = mocker.patch.object(sm, "can_access", side_effect=[False, True])

    datasource_names = [
        DatasourceName("table1", "schema1", "catalog2"),
        DatasourceName("table2", "schema1", "catalog2"),
    ]

    assert sm.get_datasources_accessible_by_user(
        database,
        datasource_names,
        catalog=None,
        schema="schema1",
    ) == [
        DatasourceName("table1", "schema1", "catalog2"),
        DatasourceName("table2", "schema1", "catalog2"),
    ]

    # Even though we passed `catalog=None,` the schema check uses the default catalog
    # when building the schema permission, since the DB supports catalog.
    can_access.assert_has_calls(
        [
            mocker.call("catalog_access", "[db1].[catalog2]"),
            mocker.call("schema_access", "[db1].[catalog2].[schema1]"),
        ]
    )


def test_get_catalogs_accessible_by_user_schema_access(
    mocker: MockerFixture,
    app_context: None,
) -> None:
    """
    Test that `get_catalogs_accessible_by_user` works with schema permissions.
    """
    sm = SupersetSecurityManager(appbuilder)
    mocker.patch.object(sm, "can_access_database", return_value=False)
    mocker.patch.object(
        sm,
        "user_view_menu_names",
        side_effect=[
            set(),  # catalog_access
            {"[db1].[catalog2].[schema1]"},  # schema_access
            set(),  # datasource_access
        ],
    )

    database = mocker.MagicMock()
    database.database_name = "db1"
    database.get_default_catalog.return_value = "catalog2"

    catalogs = {"catalog1", "catalog2"}

    assert sm.get_catalogs_accessible_by_user(database, catalogs) == {"catalog2"}
