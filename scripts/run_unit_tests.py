#!/usr/bin/env python3
"""Run the production-safe DHIS2 regression suite inside a Superset app context.

This intentionally uses only the Python standard library. Production Superset
deployments do not install pytest, while several repository test modules import
pytest or pytest-mock at module import time. Modules that need those optional
development dependencies are reported as skipped; the pytest-free regression
module covers the DHIS2 SqlaTable runtime repair path needed in production.

Usage::

    /opt/superset-venv/bin/python scripts/run_unit_tests.py
    /opt/superset-venv/bin/python scripts/run_unit_tests.py \
      tests/unit_tests/dhis2/test_superset_dataset_service.py
"""

from __future__ import annotations

import argparse
import importlib.util
import inspect
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType
from typing import Iterable


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TARGETS = (
    "tests/unit_tests/dhis2/test_superset_dataset_service.py",
    "tests/unit_tests/dhis2/test_production_regressions_unittest.py",
    # Kept as an explicit optional target for operators. Its pytest-dependent
    # tests are skipped cleanly when production dependencies omit pytest.
    "tests/unit_tests/connectors/sqla/models_test.py",
)


def _load_module(test_path: Path) -> ModuleType:
    module_name = f"production_unittest_{test_path.stem}"
    spec = importlib.util.spec_from_file_location(module_name, test_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load test module: {test_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _module_suite(module: ModuleType) -> unittest.TestSuite:
    suite = unittest.defaultTestLoader.loadTestsFromModule(module)
    for name, candidate in inspect.getmembers(module, inspect.isfunction):
        if not name.startswith("test_"):
            continue
        if inspect.signature(candidate).parameters:
            continue
        suite.addTest(unittest.FunctionTestCase(candidate, description=name))
    return suite


def _load_suites(targets: Iterable[str]) -> tuple[unittest.TestSuite, list[str]]:
    suite = unittest.TestSuite()
    skipped: list[str] = []
    for target in targets:
        test_path = (REPOSITORY_ROOT / target).resolve()
        if not test_path.is_file():
            raise FileNotFoundError(f"Test file not found: {target}")
        try:
            suite.addTests(_module_suite(_load_module(test_path)))
        except ModuleNotFoundError as exc:
            if exc.name in {"pytest", "pytest_mock"}:
                skipped.append(f"{target} (optional dependency {exc.name!r} is unavailable)")
                continue
            raise
    return suite, skipped


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-startup-backfill",
        action="store_true",
        help="allow Superset's startup compatibility backfill while creating the app",
    )
    parser.add_argument("targets", nargs="*", default=list(DEFAULT_TARGETS))
    args = parser.parse_args()

    sys.path.insert(0, str(REPOSITORY_ROOT))
    if not args.allow_startup_backfill:
        os.environ.setdefault("DHIS2_DISABLE_STARTUP_BACKFILL", "true")
    from superset.app import create_app

    app = create_app()
    with app.app_context():
        suite, skipped = _load_suites(args.targets)
        for message in skipped:
            print(f"SKIPPED: {message}")
        result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
