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
"""Tests for fail-fast DHIS2 dataValueSets extraction."""

from __future__ import annotations

import tests.dhis2._bootstrap  # noqa: F401 - must be first

from types import SimpleNamespace

import pytest
import requests

from superset.dhis2.data_value_extractor import (
    DHIS2DataValueExtractor,
    DHIS2DataValueSourceUnavailable,
)


def _instance() -> SimpleNamespace:
    return SimpleNamespace(
        name="HMIS-Test",
        url="https://dhis2.example.org",
        get_auth_headers=lambda: {},
    )


def test_timeouts_stop_extract_after_bounded_retry(mocker) -> None:
    request = mocker.patch(
        "superset.dhis2.data_value_extractor.requests.get",
        side_effect=requests.Timeout("source offline"),
    )
    sleep = mocker.patch("superset.dhis2.data_value_extractor.time.sleep")
    extractor = DHIS2DataValueExtractor(_instance())

    with pytest.raises(DHIS2DataValueSourceUnavailable) as exc:
        extractor.fetch(periods=["2024Q1"], org_units=["ou_a"])

    assert "became unavailable" in str(exc.value)
    assert request.call_count == 2
    sleep.assert_called_once()


def test_terminal_retryable_response_marks_source_unavailable(mocker) -> None:
    response = SimpleNamespace(status_code=503, text="unavailable")
    request = mocker.patch(
        "superset.dhis2.data_value_extractor.requests.get",
        return_value=response,
    )
    mocker.patch("superset.dhis2.data_value_extractor.time.sleep")
    extractor = DHIS2DataValueExtractor(_instance())

    with pytest.raises(DHIS2DataValueSourceUnavailable) as exc:
        extractor.fetch(periods=["2024Q1"], org_units=["ou_a"])

    assert "HTTP 503" in str(exc.value)
    assert request.call_count == 2
