#!/usr/bin/env python3
"""Smoke-test the locally registered DHIS2 Expert Ollama model."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


PROMPT = (
    "<|user|>\n"
    "Analyze epidemiological metric 'Malaria Cases' for Kampala District. "
    "Historical Median: 15.2, Q3 Alert: 32.0, Action Limit: 50.0 across 52 samples.\n"
    "<|assistant|>\n"
)


def main() -> None:
    payload = json.dumps({"model": "dhis2-expert", "prompt": PROMPT, "stream": False}).encode()
    request = Request(
        "http://localhost:11434/api/generate",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode())
    except (HTTPError, URLError) as exc:
        raise SystemExit(f"Ollama request failed: {exc}") from exc
    print(result.get("response", result))


if __name__ == "__main__":
    main()
