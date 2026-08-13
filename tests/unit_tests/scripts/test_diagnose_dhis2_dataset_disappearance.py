from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_module():
    root = Path(__file__).resolve().parents[3]
    module_path = root / "scripts" / "local" / "diagnose_dhis2_dataset_disappearance.py"
    spec = importlib.util.spec_from_file_location("diagnose_dhis2_dataset_disappearance", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_matches_any_normalizes_case_and_spacing():
    module = _load_module()

    needles = module._normalize_needles([" mal_pregnancy ", "MAL Prevention"])

    assert module._matches_any("MAL_PREGNANCY Dataset", needles)
    assert module._matches_any("mal   prevention wrapper", needles)
    assert not module._matches_any("anc coverage", needles)


def test_extract_staged_dataset_id_handles_json_and_fallback_regex():
    module = _load_module()

    assert module._extract_staged_dataset_id('{"dhis2_staged_dataset_id": 31}') == 31
    assert module._extract_staged_dataset_id('{"other": 1, "dhis2_staged_dataset_id":42}') == 42
    assert module._extract_staged_dataset_id({"dhis2_staged_dataset_id": "9"}) == 9
    assert module._extract_staged_dataset_id('{"dhis2_staged_dataset_id": "bad"}') is None
    assert module._extract_staged_dataset_id(None) is None
