Local maintenance helpers that are useful for this workspace but are not part of
the main application entrypoints.

Notes:
- `superset-manager*.sh` stays in the project root by design.
- `init_embedded.py` stays in the project root because deployment scripts and
  docs already reference that path.
- If one of these helpers becomes part of a documented workflow, promote it to a
  more specific subdirectory under `scripts/`.

Current incident helpers:
- `diagnose_dhis2_dataset_disappearance.py` is a read-only production triage
  helper for the DHIS2 "dataset disappeared" recurrence. Copy it to the server
  and run it inside an env-loaded `superset shell`.
