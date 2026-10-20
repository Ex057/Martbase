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
import json
import logging
from functools import partial
from typing import Optional

from superset import security_manager
from superset.commands.base import BaseCommand
from superset.commands.dataset.exceptions import (
    DatasetDeleteFailedError,
    DatasetForbiddenError,
    DatasetNotFoundError,
)
from superset.connectors.sqla.models import SqlaTable
from superset.daos.dataset import DatasetDAO
from superset.exceptions import SupersetSecurityException
from superset.utils.decorators import on_error, transaction

logger = logging.getLogger(__name__)


def _get_dhis2_staged_dataset_id(model: SqlaTable) -> int | None:
    """Return the staged dataset id carried by a generated DHIS2 dataset.

    A user deleting one of these rows through the normal Dataset API expects
    the underlying staged dataset to be deleted as well. Deleting only the
    generated ``SqlaTable`` leaves the staged definition scheduled, and the
    next sync simply registers the missing row again.
    """
    raw_extra = getattr(model, "extra", None)
    if isinstance(raw_extra, dict):
        extra = raw_extra
    elif isinstance(raw_extra, str) and raw_extra.strip():
        try:
            extra = json.loads(raw_extra)
        except (TypeError, ValueError):
            return None
    else:
        return None

    if not isinstance(extra, dict) or not extra.get("dhis2_staged_local"):
        return None

    try:
        staged_dataset_id = int(extra.get("dhis2_staged_dataset_id") or 0)
    except (TypeError, ValueError):
        return None
    return staged_dataset_id if staged_dataset_id > 0 else None


class DeleteDatasetCommand(BaseCommand):
    def __init__(self, model_ids: list[int]):
        self._model_ids = model_ids
        self._models: Optional[list[SqlaTable]] = None

    @transaction(on_error=partial(on_error, reraise=DatasetDeleteFailedError))
    def run(self) -> None:
        self.validate()
        assert self._models

        # Route explicit user deletion of generated DHIS2 datasets through the
        # staged-dataset service. That service removes the durable schedule,
        # physical tables, and every generated Superset dataset, preventing the
        # next scheduled sync from recreating the row the user just deleted.
        # Internal MART rebuilds still delete SqlaTable rows directly and are
        # intentionally unaffected by this command-level behavior.
        models_by_staged_id: dict[int, list[SqlaTable]] = {}
        regular_models: list[SqlaTable] = []
        for model in self._models:
            staged_dataset_id = _get_dhis2_staged_dataset_id(model)
            if staged_dataset_id is None:
                regular_models.append(model)
                continue
            models_by_staged_id.setdefault(staged_dataset_id, []).append(model)

        if models_by_staged_id:
            from superset.dhis2.staged_dataset_service import (
                delete_staged_dataset,
            )

            for staged_dataset_id, linked_models in models_by_staged_id.items():
                deleted = delete_staged_dataset(staged_dataset_id)
                if deleted:
                    logger.info(
                        "Deleted DHIS2 staged dataset id=%s from Dataset API",
                        staged_dataset_id,
                    )
                else:
                    # The durable staged row is already absent, so these are
                    # orphaned generated datasets and can be removed normally.
                    regular_models.extend(linked_models)

        if regular_models:
            DatasetDAO.delete(regular_models)

    def validate(self) -> None:
        # Validate/populate model exists
        self._models = DatasetDAO.find_by_ids(self._model_ids)
        if not self._models or len(self._models) != len(self._model_ids):
            raise DatasetNotFoundError()
        # Check ownership
        for model in self._models:
            try:
                security_manager.raise_for_ownership(model)
            except SupersetSecurityException as ex:
                raise DatasetForbiddenError() from ex
