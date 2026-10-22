"""Helpers for DHIS2 delete-flow transaction state."""

from __future__ import annotations

from sqlalchemy.engine import Connection
from sqlalchemy.exc import ResourceClosedError

EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY = "dhis2_explicit_staged_dataset_delete"


def _connection_info(connection: Connection) -> dict | None:
    """Return connection-local state without failing after transaction close.

    SQLAlchemy may close the Session's ``Connection`` wrapper as part of a
    commit or rollback.  Accessing ``Connection.info`` afterwards raises
    ``ResourceClosedError``; delete-context cleanup must never turn an already
    successful metadata deletion into an HTTP 500.
    """
    try:
        info = connection.info
    except ResourceClosedError:
        return None
    return info if isinstance(info, dict) else None


def mark_explicit_staged_dataset_delete(connection: Connection) -> None:
    info = _connection_info(connection)
    if info is not None:
        info[EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY] = True


def clear_explicit_staged_dataset_delete(connection: Connection) -> None:
    info = _connection_info(connection)
    if info is not None:
        info.pop(EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY, None)


def is_explicit_staged_dataset_delete(connection: Connection) -> bool:
    info = _connection_info(connection)
    return bool(
        info is not None
        and info.get(EXPLICIT_STAGED_DATASET_DELETE_INFO_KEY) is True
    )
