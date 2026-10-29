"""Pytest-only hardening checks for required telemetry metadata."""

import asyncio
import json

import pytest
from fastapi import HTTPException

from polar_twin import main


@pytest.fixture
def isolated_api_database(tmp_path, monkeypatch):
    monkeypatch.setattr(main, "DATA_DIR", tmp_path)
    monkeypatch.setattr(main, "DB_PATH", tmp_path / "prototype.sqlite3")


class FakeRequest:
    def __init__(self, payload):
        self.payload = payload
        self.headers = {}

    async def body(self):
        return json.dumps(self.payload).encode()


@pytest.mark.parametrize(
    "reading",
    [
        {"station_id": "maitri-demo", "observed_at": "2026-10-29T00:00:00Z"},
        {"station_id": "maitri-demo", "provenance": "simulated"},
        {"station_id": "maitri-demo", "observed_at": "2026-10-29T00:00:00Z", "provenance": ""},
    ],
    ids=["missing-provenance", "missing-timestamp", "empty-provenance"],
)
def test_telemetry_sync_rejects_missing_or_empty_required_metadata(isolated_api_database, reading):
    with pytest.raises(HTTPException) as error:
        asyncio.run(main.sync_queued_telemetry(FakeRequest([reading])))

    assert error.value.status_code == 400
    assert error.value.detail == "Each reading needs observed_at and provenance"
