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
from unittest.mock import MagicMock, patch

from superset.models.dashboard import Dashboard


def _slice(cls_model: object, datasource_id: int) -> MagicMock:
    slc = MagicMock()
    slc.cls_model = cls_model
    slc.datasource_id = datasource_id
    return slc


def test_datasets_trimmed_for_slices_skips_broken_datasource() -> None:
    """A single datasource whose data_for_slices() throws must NOT fail the whole
    dashboard-datasets call — it is skipped so the other charts still render.

    Regression: a broken/orphaned DHIS2 wrapper (exists but can't resolve its
    serving DB) used to raise here, failing the batched /dashboard/<id>/datasets
    request and blanking the ENTIRE dashboard, including healthy charts.
    """
    good_cls = MagicMock(name="GoodModel")
    bad_cls = MagicMock(name="BadModel")
    slices = [_slice(good_cls, 1), _slice(bad_cls, 2)]

    good_ds = MagicMock()
    good_ds.data_for_slices.return_value = {"id": 1, "ok": True}
    bad_ds = MagicMock()
    bad_ds.data_for_slices.side_effect = RuntimeError("cannot resolve serving DB")

    def fake_query(cls_model: object) -> MagicMock:
        query = MagicMock()
        datasource = good_ds if cls_model is good_cls else bad_ds
        query.filter_by.return_value.one_or_none.return_value = datasource
        return query

    with patch("superset.models.dashboard.db") as mock_db, patch.object(
        Dashboard, "slices", slices
    ):
        mock_db.session.query.side_effect = fake_query
        result = Dashboard.__new__(Dashboard).datasets_trimmed_for_slices()

    # The good datasource is returned; the broken one is skipped, no exception.
    assert result == [{"id": 1, "ok": True}]


def test_datasets_trimmed_for_slices_omits_missing_datasource() -> None:
    """A datasource that no longer exists (one_or_none -> None) is skipped."""
    cls_model = MagicMock(name="Model")
    slices = [_slice(cls_model, 99)]

    with patch("superset.models.dashboard.db") as mock_db, patch.object(
        Dashboard, "slices", slices
    ):
        query = MagicMock()
        query.filter_by.return_value.one_or_none.return_value = None
        mock_db.session.query.return_value = query
        result = Dashboard.__new__(Dashboard).datasets_trimmed_for_slices()

    assert result == []
