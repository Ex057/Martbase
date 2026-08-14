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
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch, call

import pytest
import tests.dhis2._bootstrap  # noqa: F401 - must be first


@pytest.fixture(autouse=True)
def _restore_session_methods():
    import superset

    session = superset.db.session
    method_names = ("query", "get", "add", "delete", "commit", "flush", "rollback")
    originals = {name: getattr(session, name) for name in method_names if hasattr(session, name)}
    yield
    for name, value in originals.items():
        setattr(session, name, value)


def test_delete_staged_dataset_cascades_to_sqla_table():
    import superset
    from superset.dhis2 import staged_dataset_service as svc

    # Setup mocks
    session = superset.db.session
    session.query = MagicMock()
    session.delete = MagicMock()
    session.commit = MagicMock()
    session.connection = MagicMock()
    session_connection = MagicMock()
    session_connection.info = {}
    session.connection.return_value = session_connection

    generic_dataset = MagicMock()
    staged_dataset = MagicMock()
    staged_dataset.id = 11
    staged_dataset.database_id = 10
    staged_dataset.serving_superset_dataset_id = 22
    staged_dataset.generic_dataset = generic_dataset
    
    sqla_table = MagicMock()
    sqla_table.id = 22

    with patch(
        "superset.dhis2.staged_dataset_service.get_staged_dataset",
        return_value=staged_dataset,
    ), patch(
        "superset.dhis2.staged_dataset_service._get_engine",
    ) as mock_get_engine, patch(
        "superset.dhis2.superset_dataset_service."
        "cleanup_staged_dataset_superset_resources",
    ) as mock_cleanup:
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine

        svc.delete_staged_dataset(11)

    # Verify physical tables dropped
    mock_engine.drop_staging_table.assert_called_once_with(staged_dataset)

    # The associated Superset datasets are removed via the dedicated helper,
    # and the staged dataset + its generic record are deleted from the session.
    mock_cleanup.assert_called_once()
    session.delete.assert_has_calls([
        call(staged_dataset),
        call(generic_dataset)
    ], any_order=True)
    session.commit.assert_called_once()


def _listener_source_table(staged_id: int = 11):
    return SimpleNamespace(
        id=22,
        table_name="sv_test",
        dataset_role="DHIS2_SOURCE_DATASET",
        extra=json.dumps(
            {"dhis2_staged_local": True, "dhis2_staged_dataset_id": staged_id}
        ),
    )


def test_after_sqla_table_delete_keeps_staged_when_last_table_without_explicit_delete():
    """Deleting the last linked SqlaTable must not remove the durable staged dataset.

    The explicit dataset delete service is now responsible for tearing the staged
    dataset down. Ordinary SqlaTable churn should keep the dataset record alive.
    """
    from superset.dhis2.listeners import _after_sqla_table_delete

    connection = MagicMock()
    connection.info = {}
    count_result = MagicMock()
    count_result.scalar.return_value = 0  # no other tables link
    connection.execute.side_effect = [count_result]

    _after_sqla_table_delete(None, connection, _listener_source_table())

    assert connection.execute.call_count == 0


def test_after_sqla_table_delete_keeps_staged_when_other_tables_link():
    """Regression: deleting ONE linked table (e.g. the SOURCE while a wrapper is
    re-registered) must NOT delete the shared staged dataset while its other
    tables still reference it. This listener was the UNGUARDED second delete
    path that kept orphaning datasets even after the models.py guard."""
    from superset.dhis2.listeners import _after_sqla_table_delete

    connection = MagicMock()
    connection.info = {}
    count_result = MagicMock()
    count_result.scalar.return_value = 2  # mart + wrapper still link
    connection.execute.side_effect = [count_result]

    _after_sqla_table_delete(None, connection, _listener_source_table())

    # The conservative path returns before issuing any teardown SQL.
    assert connection.execute.call_count == 0


def test_before_dhis2_staged_dataset_delete_listener():
    from superset.dhis2.listeners import _before_dhis2_staged_dataset_delete
    from superset.dhis2.models import DHIS2StagedDataset

    staged_dataset = DHIS2StagedDataset(id=11, name="Test Staged", database_id=10)

    with patch(
        "superset.dhis2.listeners._get_engine",
    ) as mock_get_engine:
        mock_engine = MagicMock()
        mock_get_engine.return_value = mock_engine

        # Trigger listener
        _before_dhis2_staged_dataset_delete(None, None, staged_dataset)

        # Verify physical tables dropped
        mock_engine.drop_staging_table.assert_called_once_with(staged_dataset)
