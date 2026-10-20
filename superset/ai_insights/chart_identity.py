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

import hashlib
import json
import re
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from superset import db
from superset.daos.key_value import KeyValueDAO
from superset.key_value.types import JsonKeyValueCodec, KeyValueResource
from superset.key_value.utils import get_deterministic_uuid
from superset.models.slice import Slice
from superset.utils.core import get_user_id

AI_CHART_METADATA_KEY = "__martbase_ai_generation"
AI_CHART_IDENTITY_VERSION = 1
_TOMBSTONE_NAMESPACE = "martbase-ai-chart-deletion-v1"
_CODEC = JsonKeyValueCodec()


def _normalize_name(value: Any) -> str:
    """Normalize a chart name without changing its user-facing value."""
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def build_ai_chart_identity(chart_config: dict[str, Any]) -> str:
    """Return a stable logical identity for an AI-generated chart.

    The identity intentionally excludes display options. Regenerating the same
    named visualization for the same datasource should update/reuse its chart,
    not create a visually identical replacement with a new database id.
    """
    logical_key = {
        "version": AI_CHART_IDENTITY_VERSION,
        "datasource_id": int(chart_config["datasource_id"]),
        "datasource_type": str(chart_config.get("datasource_type") or "table"),
        "viz_type": str(chart_config["viz_type"]),
        "slice_name": _normalize_name(chart_config["slice_name"]),
    }
    encoded = json.dumps(
        logical_key,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def add_ai_chart_metadata(
    params: dict[str, Any],
    identity: str,
) -> dict[str, Any]:
    """Copy chart params and attach durable AI provenance."""
    result = dict(params)
    result[AI_CHART_METADATA_KEY] = {
        "identity": identity,
        "identity_version": AI_CHART_IDENTITY_VERSION,
        "source": "ai_insights",
    }
    return result


def get_ai_chart_identity(chart: Slice) -> str | None:
    """Read an AI identity from persisted chart form data."""
    try:
        params = json.loads(chart.params or "{}")
    except (TypeError, ValueError):
        return None
    if not isinstance(params, dict):
        return None
    metadata = params.get(AI_CHART_METADATA_KEY)
    if not isinstance(metadata, dict):
        return None
    identity = metadata.get("identity")
    return identity if isinstance(identity, str) and identity else None


def _tombstone_key(identity: str) -> UUID:
    return get_deterministic_uuid(_TOMBSTONE_NAMESPACE, identity)


def is_ai_chart_tombstoned(identity: str) -> bool:
    """Return whether a user explicitly deleted this generated chart."""
    return (
        KeyValueDAO.get_value(
            KeyValueResource.AI_CHART_TOMBSTONE,
            _tombstone_key(identity),
            _CODEC,
        )
        is not None
    )


def record_ai_chart_tombstone(chart: Slice) -> bool:
    """Persist deletion intent for an AI chart in the Superset metadata DB."""
    identity = get_ai_chart_identity(chart)
    if not identity:
        return False
    KeyValueDAO.upsert_entry(
        KeyValueResource.AI_CHART_TOMBSTONE,
        {
            "identity": identity,
            "chart_id": chart.id,
            "slice_name": chart.slice_name,
            "datasource_id": chart.datasource_id,
            "datasource_type": chart.datasource_type,
            "deleted_by": get_user_id(),
            "deleted_at": datetime.now(timezone.utc).isoformat(),
        },
        _CODEC,
        _tombstone_key(identity),
    )
    return True


def find_existing_ai_chart(
    chart_config: dict[str, Any],
    identity: str,
) -> Slice | None:
    """Find the active chart for an AI logical identity, if it exists."""
    candidates = (
        db.session.query(Slice)
        .filter(
            Slice.datasource_id == int(chart_config["datasource_id"]),
            Slice.datasource_type
            == str(chart_config.get("datasource_type") or "table"),
            Slice.viz_type == str(chart_config["viz_type"]),
        )
        .all()
    )
    return next(
        (chart for chart in candidates if get_ai_chart_identity(chart) == identity),
        None,
    )
