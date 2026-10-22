from __future__ import annotations

import importlib.util
import os
import shlex
import subprocess
import sys
from pathlib import Path
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


def _check_systemd_service_candidates(
    service_names: list[str],
) -> tuple[bool, int | None]:
    for service_name in service_names:
        running, pid = _check_systemd_service_running(service_name)
        if running:
            return running, pid
    return False, None


def _systemd_unit_exists(service_name: str) -> bool:
    """Return whether a systemd unit is installed, regardless of its state."""
    try:
        result = subprocess.run(
            ["systemctl", "show", service_name, "--property=LoadState", "--value"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        return result.returncode == 0 and result.stdout.strip() == "loaded"
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


def _read_process_children(pid: int, *, proc_root: str = "/proc") -> list[int]:
    children_path = Path(proc_root) / str(pid) / "task" / str(pid) / "children"
    try:
        return [int(value) for value in children_path.read_text().split()]
    except (FileNotFoundError, PermissionError, ValueError, OSError):
        return []


def _process_tree_pids(pid: int, *, proc_root: str = "/proc") -> list[int]:
    pending = [pid]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if current in seen:
            continue
        seen.add(current)
        pending.extend(_read_process_children(current, proc_root=proc_root))
    return sorted(seen)


def _parse_open_file_limits(limits_text: str) -> tuple[int | None, int | None]:
    for line in limits_text.splitlines():
        if not line.startswith("Max open files"):
            continue
        values = line[len("Max open files") :].split()
        if len(values) < 2:
            return None, None

        def _limit(value: str) -> int | None:
            if value.lower() == "unlimited":
                return None
            try:
                return int(value)
            except ValueError:
                return None

        return _limit(values[0]), _limit(values[1])
    return None, None


def get_file_descriptor_status(
    pid: int | None,
    *,
    proc_root: str = "/proc",
) -> dict[str, Any]:
    """Return bounded, read-only FD diagnostics for a process tree."""
    if not pid:
        return {
            "available": False,
            "open": 0,
            "soft_limit": None,
            "max_process_usage_percent": None,
            "severity": "unknown",
            "processes": [],
        }

    processes: list[dict[str, Any]] = []
    for process_pid in _process_tree_pids(pid, proc_root=proc_root):
        process_path = Path(proc_root) / str(process_pid)
        try:
            open_count = len(list((process_path / "fd").iterdir()))
            limits_text = (process_path / "limits").read_text()
            soft_limit, hard_limit = _parse_open_file_limits(limits_text)
            try:
                name = (process_path / "comm").read_text().strip()
            except (FileNotFoundError, PermissionError, OSError):
                name = str(process_pid)
        except (FileNotFoundError, PermissionError, OSError):
            continue

        usage_percent = (
            round(open_count / soft_limit * 100, 2)
            if soft_limit and soft_limit > 0
            else None
        )
        processes.append(
            {
                "pid": process_pid,
                "name": name,
                "open": open_count,
                "soft_limit": soft_limit,
                "hard_limit": hard_limit,
                "usage_percent": usage_percent,
            }
        )

    if not processes:
        return {
            "available": False,
            "open": 0,
            "soft_limit": None,
            "max_process_usage_percent": None,
            "severity": "unknown",
            "processes": [],
        }

    total_open = sum(process["open"] for process in processes)
    finite_limits = [
        process["soft_limit"]
        for process in processes
        if process["soft_limit"] is not None
    ]
    usages = [
        process["usage_percent"]
        for process in processes
        if process["usage_percent"] is not None
    ]
    max_usage = max(usages) if usages else None
    severity = (
        "critical"
        if max_usage is not None and max_usage >= 90
        else "warning"
        if max_usage is not None and max_usage >= 70
        else "healthy"
    )
    return {
        "available": True,
        "open": total_open,
        "soft_limit": sum(finite_limits) if finite_limits else None,
        "max_process_usage_percent": max_usage,
        "severity": severity,
        "processes": processes,
    }


def get_system_file_descriptor_status(
    *, proc_root: str = "/proc"
) -> dict[str, Any]:
    try:
        values = (Path(proc_root) / "sys" / "fs" / "file-nr").read_text().split()
        allocated, unused, maximum = (int(value) for value in values[:3])
        open_count = max(0, allocated - unused)
        usage_percent = round(open_count / maximum * 100, 2) if maximum else None
        return {
            "available": True,
            "open": open_count,
            "allocated": allocated,
            "unused": unused,
            "maximum": maximum,
            "usage_percent": usage_percent,
        }
    except (FileNotFoundError, PermissionError, ValueError, OSError):
        return {
            "available": False,
            "open": 0,
            "maximum": None,
            "usage_percent": None,
        }


def _service_pid_paths() -> dict[str, dict[str, str]]:
    project_root = _project_root()
    return {
        "backend": {
            "pid_file": os.environ.get(
                "LOCAL_STAGING_BACKEND_PID_FILE",
                os.path.join(project_root, "run", "superset.pid"),
            ),
        },
        "celery": {
            "worker_pid_file": os.environ.get(
                "LOCAL_STAGING_CELERY_WORKER_PID_FILE",
                os.path.join(project_root, "run", "celery-worker.pid"),
            ),
            "beat_pid_file": os.environ.get(
                "LOCAL_STAGING_CELERY_BEAT_PID_FILE",
                os.path.join(project_root, "run", "celerybeat.pid"),
            ),
        },
    }


def _default_restart_commands() -> dict[str, str]:
    # Production runs under these systemd units. Prefer them over the repository
    # manager script when they are installed; the application service account
    # must have narrowly scoped passwordless sudo permission for the restart
    # commands. Environment overrides still take precedence in
    # ``_restart_command_for``.
    commands: dict[str, str] = {}
    if _systemd_unit_exists("superset"):
        commands["backend"] = "sudo -n systemctl restart superset"
    if _systemd_unit_exists("superset-worker") and _systemd_unit_exists(
        "superset-beat"
    ):
        commands["celery"] = (
            "sudo -n systemctl restart superset-worker superset-beat"
        )

    project_root = _project_root()
    manager_script = os.path.join(project_root, "superset-manager.sh")
    if os.path.isfile(manager_script):
        quoted_script = shlex.quote(manager_script)
        commands.setdefault("backend", f"bash {quoted_script} restart")
        commands.setdefault("celery", f"bash {quoted_script} restart-celery")
    return commands


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
        backend_running, backend_pid = _check_systemd_service_candidates(
            ["superset", "martbase-web"]
        )

    celery_worker_pid = _read_running_pid(pid_paths["celery"]["worker_pid_file"])
    worker_running = celery_worker_pid is not None
    if not worker_running:
        worker_running, celery_worker_pid = _check_systemd_service_candidates(
            ["superset-worker", "martbase-worker"]
        )

    celery_beat_pid = _read_running_pid(pid_paths["celery"]["beat_pid_file"])
    beat_running = celery_beat_pid is not None
    if not beat_running:
        beat_running, celery_beat_pid = _check_systemd_service_candidates(
            ["superset-beat", "martbase-beat"]
        )

    backend_fds = get_file_descriptor_status(backend_pid)
    worker_fds = get_file_descriptor_status(celery_worker_pid)
    beat_fds = get_file_descriptor_status(celery_beat_pid)

    return {
        "services": {
            "backend": {
                "name": "backend",
                "label": "Web server",
                "running": backend_running,
                "pid": backend_pid,
                "pid_file": pid_paths["backend"]["pid_file"],
                "restart_available": _restart_command_for("backend") is not None,
                "file_descriptors": backend_fds,
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
                "worker_file_descriptors": worker_fds,
                "beat_file_descriptors": beat_fds,
            },
        },
        "system_file_descriptors": get_system_file_descriptor_status(),
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
