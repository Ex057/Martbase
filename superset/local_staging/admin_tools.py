from __future__ import annotations

import importlib.util
import os
import shlex
import subprocess
import sys
from typing import Any

from superset.local_staging.platform_settings import (
    ENGINE_CLICKHOUSE,
    ENGINE_DUCKDB,
    ENGINE_SUPERSET_DB,
)

ENGINE_DEPENDENCIES: dict[str, list[dict[str, str]]] = {
    ENGINE_SUPERSET_DB: [],
    ENGINE_DUCKDB: [
        {"package": "duckdb", "module": "duckdb"},
        {"package": "duckdb-engine", "module": "duckdb_engine"},
    ],
    ENGINE_CLICKHOUSE: [
        {"package": "clickhouse-connect", "module": "clickhouse_connect"},
    ],
}

MANAGED_STAGING_PREFIX = "ds_"
MANAGED_SERVING_PREFIX = "sv_"
_RESTART_DELAY_SECONDS = 1.0


def classify_table_name(table_name: str) -> dict[str, Any]:
    normalized = str(table_name or "").strip().lower()
    is_build = normalized.endswith("__loading") or "__build_" in normalized
    if is_build and normalized.startswith(MANAGED_SERVING_PREFIX):
        return {"role": "build", "managed": True}
    if normalized.startswith(MANAGED_STAGING_PREFIX):
        return {"role": "staging", "managed": True}
    if normalized.startswith(MANAGED_SERVING_PREFIX):
        return {"role": "serving", "managed": True}
    return {"role": "other", "managed": False}


def build_table_metadata(
    *,
    schema: str,
    name: str,
    table_type: str,
    row_count: int | None,
) -> dict[str, Any]:
    table_info = classify_table_name(name)
    return {
        "schema": schema,
        "name": name,
        "full_name": f"{schema}.{name}" if schema else name,
        "type": table_type,
        "row_count": row_count,
        **table_info,
    }


def is_safe_identifier(identifier: str) -> bool:
    value = str(identifier or "")
    return bool(value) and value.replace("_", "").isalnum()


def _package_status(package_name: str, module_name: str) -> dict[str, Any]:
    installed = importlib.util.find_spec(module_name) is not None
    return {
        "package_name": package_name,
        "module_name": module_name,
        "installed": installed,
        "required": True,
    }


def get_dependency_status() -> dict[str, Any]:
    status: dict[str, Any] = {}
    for engine_name, packages in ENGINE_DEPENDENCIES.items():
        package_statuses = [
            _package_status(package["package"], package["module"])
            for package in packages
        ]
        ready = all(package["installed"] for package in package_statuses)
        status[engine_name] = {
            "engine": engine_name,
            "ready": ready,
            "packages": package_statuses,
            "install_command": (
                " ".join([sys.executable, "-m", "pip", "install", *[
                    package["package"] for package in packages
                ]])
                if packages
                else None
            ),
        }
    return status


def trim_command_output(output: str, *, max_chars: int = 4000) -> str:
    text = str(output or "").strip()
    if len(text) <= max_chars:
        return text
    return f"{text[:max_chars]}…"


def install_engine_dependencies(engine_name: str) -> dict[str, Any]:
    packages = ENGINE_DEPENDENCIES.get(engine_name)
    if packages is None:
        raise ValueError(f"Unknown engine: {engine_name}")
    if not packages:
        return {
            "ok": True,
            "engine": engine_name,
            "packages": [],
            "message": "No additional packages are required for this engine.",
            "dependency_status": get_dependency_status().get(engine_name, {}),
        }

    package_names = [package["package"] for package in packages]
    command = [sys.executable, "-m", "pip", "install", *package_names]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        check=False,
        timeout=900,
    )
    dependency_status = get_dependency_status().get(engine_name, {})
    stdout = trim_command_output(completed.stdout)
    stderr = trim_command_output(completed.stderr)
    ok = completed.returncode == 0 and bool(dependency_status.get("ready"))
    return {
        "ok": ok,
        "engine": engine_name,
        "packages": package_names,
        "command": " ".join(command),
        "returncode": completed.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "message": (
            f"Installed dependencies for {engine_name}"
            if ok
            else f"Dependency installation failed for {engine_name}"
        ),
        "dependency_status": dependency_status,
    }


def _project_root() -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _read_running_pid(pid_file: str) -> int | None:
    try:
        with open(pid_file) as handle:
            pid = int(handle.read().strip())
        os.kill(pid, 0)
        return pid
    except (FileNotFoundError, ValueError, ProcessLookupError, PermissionError):
        return None


def _check_systemd_service_running(service_name: str) -> tuple[bool, int | None]:
    """Check if a systemd service is running. Returns (is_running, pid)."""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "--quiet", service_name],
            capture_output=True,
            timeout=5,
        )
        is_running = result.returncode == 0
        pid = None
        if is_running:
            pid_result = subprocess.run(
                ["systemctl", "show", service_name, "--property=MainPID", "--value"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if pid_result.returncode == 0:
                try:
                    pid = int(pid_result.stdout.strip())
                    if pid == 0:
                        pid = None
                except ValueError:
                    pass
        return is_running, pid
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        return False, None


def _service_pid_paths() -> dict[str, dict[str, str]]:
    project_root = _project_root()
    return {
        "backend": {
            "pid_file": os.environ.get(
                "LOCAL_STAGING_BACKEND_PID_FILE",
                os.path.join(project_root, "superset_backend.pid"),
            ),
        },
        "celery": {
            "worker_pid_file": os.environ.get(
                "LOCAL_STAGING_CELERY_WORKER_PID_FILE",
                os.path.join(project_root, "celery_worker.pid"),
            ),
            "beat_pid_file": os.environ.get(
                "LOCAL_STAGING_CELERY_BEAT_PID_FILE",
                os.path.join(project_root, "celery_beat.pid"),
            ),
        },
    }


def _default_restart_commands() -> dict[str, str]:
    project_root = _project_root()
    manager_script = os.path.join(project_root, "superset-manager.sh")
    if not os.path.isfile(manager_script):
        return {}
    quoted_script = shlex.quote(manager_script)
    return {
        "backend": f"bash {quoted_script} restart",
        "celery": f"bash {quoted_script} restart-celery",
    }


def _restart_command_for(service_name: str) -> str | None:
    env_var = f"LOCAL_STAGING_RESTART_{service_name.upper()}_COMMAND"
    configured = str(os.environ.get(env_var) or "").strip()
    if configured:
        return configured
    return _default_restart_commands().get(service_name)


def get_runtime_service_status() -> dict[str, Any]:
    pid_paths = _service_pid_paths()

    # Try PID files first, fall back to systemd status check
    backend_pid = _read_running_pid(pid_paths["backend"]["pid_file"])
    backend_running = backend_pid is not None
    if not backend_running:
        backend_running, backend_pid = _check_systemd_service_running("martbase-web")

    celery_worker_pid = _read_running_pid(pid_paths["celery"]["worker_pid_file"])
    worker_running = celery_worker_pid is not None
    if not worker_running:
        worker_running, celery_worker_pid = _check_systemd_service_running("martbase-worker")

    celery_beat_pid = _read_running_pid(pid_paths["celery"]["beat_pid_file"])
    beat_running = celery_beat_pid is not None
    if not beat_running:
        beat_running, celery_beat_pid = _check_systemd_service_running("martbase-beat")

    return {
        "services": {
            "backend": {
                "name": "backend",
                "label": "Web server",
                "running": backend_running,
                "pid": backend_pid,
                "pid_file": pid_paths["backend"]["pid_file"],
                "restart_available": _restart_command_for("backend") is not None,
            },
            "celery": {
                "name": "celery",
                "label": "Celery worker + beat",
                "running": worker_running or beat_running,
                "worker_running": worker_running,
                "worker_pid": celery_worker_pid,
                "worker_pid_file": pid_paths["celery"]["worker_pid_file"],
                "beat_running": beat_running,
                "beat_pid": celery_beat_pid,
                "beat_pid_file": pid_paths["celery"]["beat_pid_file"],
                "restart_available": _restart_command_for("celery") is not None,
            },
        }
    }


def restart_runtime_service(service_name: str) -> dict[str, Any]:
    if service_name not in {"backend", "celery"}:
        raise ValueError(f"Unsupported service: {service_name}")

    command = _restart_command_for(service_name)
    if not command:
        raise ValueError(
            f"No restart command configured for {service_name}. "
            f"Set LOCAL_STAGING_RESTART_{service_name.upper()}_COMMAND."
        )

    subprocess.Popen(  # noqa: S603,S607 - trusted admin-configured command
        [
            "bash",
            "-lc",
            f"sleep {_RESTART_DELAY_SECONDS:g}; {command}",
        ],
        cwd=_project_root(),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )

    return {
        "service": service_name,
        "queued": True,
        "message": (
            "Restart queued for web server."
            if service_name == "backend"
            else "Restart queued for Celery worker + beat."
        ),
    }
