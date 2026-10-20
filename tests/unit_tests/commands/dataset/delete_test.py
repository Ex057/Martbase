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

from pytest_mock import MockerFixture

from superset.commands.dataset.delete import DeleteDatasetCommand


def _dataset(mocker: MockerFixture, dataset_id: int, extra: str):
    dataset = mocker.MagicMock()
    dataset.id = dataset_id
    dataset.extra = extra
    return dataset


def _prepare_command(mocker: MockerFixture, datasets: list):
    dataset_dao = mocker.patch("superset.commands.dataset.delete.DatasetDAO")
    dataset_dao.find_by_ids.return_value = datasets
    mocker.patch(
        "superset.commands.dataset.delete.security_manager.raise_for_ownership"
    )
    return DeleteDatasetCommand([dataset.id for dataset in datasets]), dataset_dao


def test_delete_regular_dataset_uses_dataset_dao(mocker: MockerFixture) -> None:
    dataset = _dataset(mocker, 10, "{}")
    command, dataset_dao = _prepare_command(mocker, [dataset])

    command.run()

    dataset_dao.delete.assert_called_once_with([dataset])


def test_delete_generated_dhis2_dataset_removes_staged_dataset(
    mocker: MockerFixture,
) -> None:
    dataset = _dataset(
        mocker,
        20,
        '{"dhis2_staged_local": true, "dhis2_staged_dataset_id": 7}',
    )
    command, dataset_dao = _prepare_command(mocker, [dataset])
    delete_staged_dataset = mocker.patch(
        "superset.dhis2.staged_dataset_service.delete_staged_dataset",
        return_value=True,
    )

    command.run()

    delete_staged_dataset.assert_called_once_with(7)
    dataset_dao.delete.assert_not_called()


def test_delete_legacy_generated_dhis2_dataset_without_local_marker(
    mocker: MockerFixture,
) -> None:
    dataset = _dataset(
        mocker,
        20,
        '{"dhis2_staged_dataset_id": 7, "dhis2_serving_table_ref": '
        '"dhis2_serving.sv_7_legacy"}',
    )
    command, dataset_dao = _prepare_command(mocker, [dataset])
    delete_staged_dataset = mocker.patch(
        "superset.dhis2.staged_dataset_service.delete_staged_dataset",
        return_value=True,
    )

    command.run()

    delete_staged_dataset.assert_called_once_with(7)
    dataset_dao.delete.assert_not_called()


def test_delete_multiple_generated_rows_deletes_staged_dataset_once(
    mocker: MockerFixture,
) -> None:
    extra = '{"dhis2_staged_local": true, "dhis2_staged_dataset_id": 7}'
    source = _dataset(mocker, 20, extra)
    mart = _dataset(mocker, 21, extra)
    command, dataset_dao = _prepare_command(mocker, [source, mart])
    delete_staged_dataset = mocker.patch(
        "superset.dhis2.staged_dataset_service.delete_staged_dataset",
        return_value=True,
    )

    command.run()

    delete_staged_dataset.assert_called_once_with(7)
    dataset_dao.delete.assert_not_called()


def test_delete_orphaned_generated_dataset_falls_back_to_dataset_dao(
    mocker: MockerFixture,
) -> None:
    dataset = _dataset(
        mocker,
        20,
        '{"dhis2_staged_local": true, "dhis2_staged_dataset_id": 999}',
    )
    command, dataset_dao = _prepare_command(mocker, [dataset])
    delete_staged_dataset = mocker.patch(
        "superset.dhis2.staged_dataset_service.delete_staged_dataset",
        return_value=False,
    )

    command.run()

    delete_staged_dataset.assert_called_once_with(999)
    dataset_dao.delete.assert_called_once_with([dataset])
