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
"""Tests for local staging admin process controls."""

from __future__ import annotations

import tests.dhis2._bootstrap  # noqa: F401 - must be first


def test_get_runtime_service_status_reads_pid_files(tmp_path, mocker) -> None:
    from superset.local_staging import admin_tools

    backend_pid = tmp_path / "superset_backend.pid"
    backend_pid.write_text("111\n")
    worker_pid = tmp_path / "celery_worker.pid"
    worker_pid.write_text("222\n")
    beat_pid = tmp_path / "celery_beat.pid"
    beat_pid.write_text("333\n")

    mocker.patch.dict(
        "os.environ",
        {
            "LOCAL_STAGING_BACKEND_PID_FILE": str(backend_pid),
            "LOCAL_STAGING_CELERY_WORKER_PID_FILE": str(worker_pid),
            "LOCAL_STAGING_CELERY_BEAT_PID_FILE": str(beat_pid),
            "LOCAL_STAGING_RESTART_BACKEND_COMMAND": "echo restart backend",
            "LOCAL_STAGING_RESTART_CELERY_COMMAND": "echo restart celery",
        },
        clear=False,
    )
    kill = mocker.patch("superset.local_staging.admin_tools.os.kill")

    result = admin_tools.get_runtime_service_status()

    assert kill.call_count == 3
    assert result["services"]["backend"]["running"] is True
    assert result["services"]["backend"]["pid"] == 111
    assert result["services"]["backend"]["restart_available"] is True
    assert result["services"]["celery"]["worker_running"] is True
    assert result["services"]["celery"]["beat_running"] is True
    assert result["services"]["celery"]["worker_pid"] == 222
    assert result["services"]["celery"]["beat_pid"] == 333


def test_restart_runtime_service_queues_background_command(mocker) -> None:
    from superset.local_staging import admin_tools

    popen = mocker.patch("superset.local_staging.admin_tools.subprocess.Popen")
    mocker.patch.dict(
        "os.environ",
        {
            "LOCAL_STAGING_RESTART_CELERY_COMMAND": "service superset-worker restart",
        },
        clear=False,
    )

    result = admin_tools.restart_runtime_service("celery")

    popen.assert_called_once()
    command = popen.call_args.args[0]
    assert command[:2] == ["bash", "-lc"]
    assert "service superset-worker restart" in command[2]
    assert result["queued"] is True
    assert result["service"] == "celery"
