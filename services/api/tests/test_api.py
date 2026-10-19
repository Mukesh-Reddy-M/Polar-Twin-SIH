"""Endpoint-contract tests for station-specific synthetic scenarios."""

import gzip
import json
from pathlib import Path
import shutil
import unittest
from uuid import uuid4

from fastapi import HTTPException

from polar_twin import main


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(__file__).resolve().parents[1] / ".test-data" / uuid4().hex
        self.temp_dir.mkdir(parents=True)
        self.original_data_dir = main.DATA_DIR
        self.original_db_path = main.DB_PATH
        main.DATA_DIR = self.temp_dir
        main.DB_PATH = main.DATA_DIR / "prototype.sqlite3"

    def tearDown(self):
        main.DATA_DIR = self.original_data_dir
        main.DB_PATH = self.original_db_path
        shutil.rmtree(self.temp_dir)

    @staticmethod
    def finish(coroutine):
        """Complete an endpoint coroutine whose test request body returns immediately."""
        try:
            coroutine.send(None)
        except StopIteration as completed:
            return completed.value
        raise AssertionError("The test request unexpectedly required an event loop")

    @staticmethod
    def fake_request(body: bytes, content_encoding: str = ""):
        class Request:
            headers = {"content-encoding": content_encoding}

            async def body(self):
                return body

        return Request()

    def test_each_station_can_storm_and_reset_without_mixing_state(self):
        maitri_normal = main.get_latest_reading("maitri-demo")
        bharati_storm = main.set_scenario("storm", "bharati-demo")
        maitri_storm = main.set_scenario("storm", "maitri-demo")
        maitri_reset = main.set_scenario("reset", "maitri-demo")
        bharati_latest = main.get_latest_reading("bharati-demo")

        self.assertEqual(maitri_normal["scenario"], "normal")
        self.assertEqual(bharati_storm["station_id"], "bharati-demo")
        self.assertEqual(maitri_storm["scenario"], "storm")
        self.assertEqual(maitri_reset["scenario"], "normal")
        self.assertEqual(maitri_reset["alert"]["level"], "normal")
        self.assertEqual(bharati_latest["station_id"], "bharati-demo")
        self.assertEqual(bharati_latest["scenario"], "storm")
        self.assertEqual(bharati_latest["alert"]["level"], "warning")

    def test_invalid_station_and_scenario_contract_are_clear(self):
        with self.assertRaises(HTTPException) as unknown:
            main.get_latest_reading("unknown-demo")
        self.assertEqual(unknown.exception.status_code, 404)
        self.assertEqual(unknown.exception.detail, "Unknown station profile")

        schema = main.app.openapi()
        scenario_parameter = next(
            parameter for parameter in schema["paths"]["/api/scenario/{scenario}"]["post"]["parameters"]
            if parameter["name"] == "scenario"
        )
        self.assertEqual(scenario_parameter["schema"]["enum"], ["storm", "reset"])

    def test_sync_preserves_station_and_validates_unknown_station(self):
        reading = main.get_latest_reading("bharati-demo")
        response = self.finish(main.sync_queued_telemetry(
            self.fake_request(gzip.compress(json.dumps([reading]).encode()), "gzip")
        ))
        with self.assertRaises(HTTPException) as invalid:
            self.finish(main.sync_queued_telemetry(self.fake_request(json.dumps([{
                "station_id": "unknown-demo",
                "observed_at": "2026-10-19T00:00:00+00:00",
                "provenance": "simulated",
            }]).encode())))

        self.assertEqual(response["accepted_readings"], 1)
        self.assertEqual(response["compression"], "gzip")
        self.assertEqual(invalid.exception.status_code, 404)
        self.assertEqual(invalid.exception.detail, "Unknown station profile")
