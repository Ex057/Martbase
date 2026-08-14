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
from typing import Any

import sqlalchemy as sa
from sqlalchemy import event
from sqlalchemy.orm import Mapper

from superset.connectors.sqla.models import SqlaTable
from superset.dhis2.models import DHIS2StagedDataset
from superset.dhis2.staged_dataset_service import _get_engine
from superset.dhis2_delete_context import is_explicit_staged_dataset_delete
from superset.staging.models import StagedDataset as GenericStagedDataset

logger = logging.getLogger(__name__)


def setup_listeners() -> None:
    """Register DHIS2-specific model event listeners."""
    # 1. When a SqlaTable is deleted, check if it's a DHIS2 staged-local dataset
    # and clean up the associated DHIS2StagedDataset and physical tables.
    event.listen(SqlaTable, "after_delete", _after_sqla_table_delete)

    # 2. When a DHIS2StagedDataset is deleted (e.g. via Database cascade),
    # ensure physical tables are dropped.
    # Note: delete_staged_dataset already does this when called directly,
    # but cascade deletion bypasses the service layer.
    event.listen(DHIS2StagedDataset, "before_delete", _before_dhis2_staged_dataset_delete)


def _after_sqla_table_delete(mapper: Mapper, connection: Any, target: Any) -> None:
    """Skip destructive DHIS2 cleanup for incidental SqlaTable deletes."""
    try:
        from superset.datasets.policy import DatasetRole

        extra_raw = getattr(target, "extra", None)
        if not extra_raw:
            return

        extra = json.loads(extra_raw) if isinstance(extra_raw, str) else extra_raw
        if not extra.get("dhis2_staged_local"):
            return

        staged_dataset_id = extra.get("dhis2_staged_dataset_id")
        if not staged_dataset_id:
            return

        # Do NOT cascade-delete the staged dataset when a mart record is removed.
        # Mart records are generated derived tables; deleting them is routine
        # (e.g. during migration/rebuild) and must not destroy the source dataset.
        role = getattr(target, "dataset_role", None)
        if role == DatasetRole.MART.value:
            logger.debug(
                "DHIS2 listener: SqlaTable id=%s is a mart (role=%s) — skipping staged dataset cleanup",
                target.id,
                role,
            )
            return

        if not is_explicit_staged_dataset_delete(connection):
            logger.info(
                "DHIS2 listener: keeping staged dataset id=%s after SqlaTable id=%s delete outside explicit delete flow",
                staged_dataset_id,
                target.id,
            )
            return
        logger.debug(
            "DHIS2 listener: explicit delete flow already handles staged dataset id=%s; SqlaTable cleanup remains conservative",
            staged_dataset_id,
        )
    except Exception:
        logger.exception("DHIS2 listener: failed to clean up staged dataset after SqlaTable delete")


def _before_dhis2_staged_dataset_delete(mapper: Mapper, connection: Any, target: Any) -> None:
    """Drop physical tables and clean up generic metadata before the DHIS2StagedDataset is removed."""
    try:
        logger.info(
            "DHIS2 listener: DHIS2StagedDataset id=%s ('%s') being deleted; dropping physical tables",
            target.id,
            target.name,
        )
        
        # 1. Drop physical tables
        engine = _get_engine(target.database_id)
        engine.drop_staging_table(target)
        engine.drop_serving_table(target)

        # 2. Delete generic StagedDataset record if it exists using the current connection.
        generic_dataset_id = getattr(target, "generic_dataset_id", None)
        if generic_dataset_id:
            logger.info(
                "DHIS2 listener: also deleting generic StagedDataset record id=%s",
                generic_dataset_id,
            )
            connection.execute(
                GenericStagedDataset.__table__.delete().where(
                    GenericStagedDataset.__table__.c.id == generic_dataset_id
                )
            )
    except Exception:
        logger.exception("DHIS2 listener: failed to clean up physical state for staged dataset id=%s", target.id)
