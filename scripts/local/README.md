Local maintenance helpers that are useful for this workspace but are not part of
the main application entrypoints.

Notes:
- `superset-manager*.sh` stays in the project root by design.
- `init_embedded.py` stays in the project root because deployment scripts and
  docs already reference that path.
- If one of these helpers becomes part of a documented workflow, promote it to a
  more specific subdirectory under `scripts/`.
