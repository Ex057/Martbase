"""Helpers for DHIS2 delete-flow transaction state."""

from __future__ import annotations

from sqlalchemy.engine import Connection

EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY = "dhis2_explicit_staged_dataset_delete"


def mark_explicit_staged_dataset_delete(connection: Connection) -> None:
    info = getattr(connection, "info", None)
    if isinstance(info, dict):
        info[EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY] = True


def clear_explicit_staged_dataset_delete(connection: Connection) -> None:
    info = getattr(connection, "info", None)
    if isinstance(info, dict):
        info.pop(EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY, None)


def is_explicit_staged_dataset_delete(connection: Connection) -> bool:
    info = getattr(connection, "info", None)
    return bool(
        isinstance(info, dict)
        and info.get(EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY) is True
    )
