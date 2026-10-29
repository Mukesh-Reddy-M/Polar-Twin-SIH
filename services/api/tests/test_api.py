"""Endpoint-contract tests for station-specific synthetic scenarios."""

import gzip
import json
from pathlib import Path
import shutil
import unittest
from datetime import datetime, timedelta, timezone
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
        self.assertEqual(bharati_latest["alert"]["level"], "normal")
        self.assertEqual(bharati_latest["alert"]["target_level"], "warning")
        self.assertEqual(bharati_latest["alert"]["pending"]["type"], "promotion")
        self.assertIn("health", bharati_latest)
        self.assertEqual(bharati_latest["health"]["provenance"], "simulated")

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

    def test_alert_promotion_timer_persists_between_api_assessments(self):
        reading = main.make_reading("bharati-demo", storm_active=True)
        start = datetime(2026, 10, 29, tzinfo=timezone.utc)
        first = main.assess_reading(reading, start)
        later = main.assess_reading(reading, start + timedelta(seconds=10))

        self.assertEqual(first["alert"]["level"], "normal")
        self.assertEqual(first["alert"]["pending"]["type"], "promotion")
        self.assertEqual(later["alert"]["level"], "warning")
        with main.database_connection() as connection:
            row = connection.execute(
                "SELECT state FROM station_assessments WHERE station_id = ?", ("bharati-demo",)
            ).fetchone()
        self.assertEqual(json.loads(row["state"])["alert"]["current_level"], "warning")

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

    def test_requisition_workflow_is_server_owned_and_eta_updates_stock_out_comparison(self):
        leader = main.Actor(role="station_leader", name="Station Leader (demo)")
        logistics = main.Actor(role="logistics", name="Logistics (demo)")
        management = main.Actor(role="management", name="Management (demo)")
        created = main.create_requisition(main.RequisitionCreate(
            station_id="maitri-demo", quantity=1000, reason="Synthetic storm demo", actor=leader,
        ))
        request_id = created["requisition_id"]
        self.assertEqual(created["status"], "draft")
        main.update_requisition(request_id, main.RequisitionEdit(
            actor=leader, quantity=1200, unit="litres", reason="Updated synthetic storm demo",
        ))
        self.assertEqual(main.submit_requisition(request_id, main.WorkflowAction(actor=leader))["status"], "submitted")
        self.assertEqual(main.review_requisition(request_id, main.WorkflowAction(actor=logistics))["status"], "in_review")
        self.assertEqual(main.decide_requisition(request_id, main.DecisionAction(
            actor=management, decision="approved", notes="Demo approval",
        ))["status"], "approved")

        eta = datetime.now(timezone.utc) + timedelta(days=5)
        dispatched = main.dispatch_requisition(request_id, main.DispatchAction(
            actor=logistics, shipment_reference="DEMO-001", eta_at=eta,
        ))
        self.assertEqual(dispatched["status"], "dispatched")
        first_outlook = main.get_latest_reading("maitri-demo")["inventory"]
        self.assertEqual(first_outlook["eta_source"], "dispatched_requisition")
        self.assertLess(first_outlook["shipment_eta_in_days"], first_outlook["stockout_in_days"])

        revised_eta = datetime.now(timezone.utc) + timedelta(days=50)
        main.update_requisition_eta(request_id, main.EtaAction(actor=logistics, eta_at=revised_eta))
        revised_outlook = main.get_latest_reading("maitri-demo")["inventory"]
        self.assertEqual(revised_outlook["eta_source"], "dispatched_requisition")
        self.assertGreater(revised_outlook["shipment_eta_in_days"], revised_outlook["stockout_in_days"])
        self.assertEqual(main.set_scenario("storm", "maitri-demo")["inventory"]["eta_source"], "dispatched_requisition")
        delivered = main.confirm_requisition_delivery(request_id, main.DeliveryAction(
            actor=leader, received_quantity=1150,
        ))
        self.assertEqual(delivered["status"], "delivered")
        closed = main.close_requisition(request_id, main.WorkflowAction(actor=leader, notes="Demo closed"))
        self.assertEqual(closed["status"], "closed")

        history = main.requisition_history(request_id)
        self.assertEqual([event["action"] for event in history], [
            "created", "updated", "submitted", "review_started", "approved", "dispatched",
            "eta_updated", "delivery_confirmed", "closed",
        ])
        self.assertTrue(all(event["actor"]["name"] and event["occurred_at"] and event["provenance"] for event in history))
        self.assertEqual(history[-3]["details"]["eta_at"], revised_eta.isoformat())

    def test_requisition_rejects_wrong_role_and_invalid_transition(self):
        leader = main.Actor(role="station_leader", name="Leader")
        request = main.create_requisition(main.RequisitionCreate(
            station_id="bharati-demo", quantity=20, reason="Demo request", actor=leader,
        ))
        with self.assertRaises(HTTPException) as wrong_role:
            main.review_requisition(request["requisition_id"], main.WorkflowAction(actor=leader))
        self.assertEqual(wrong_role.exception.status_code, 403)
        with self.assertRaises(HTTPException) as wrong_state:
            main.dispatch_requisition(request["requisition_id"], main.DispatchAction(
                actor=main.Actor(role="logistics", name="Logistics"),
                shipment_reference="X", eta_at=datetime.now(timezone.utc) + timedelta(days=1),
            ))
        self.assertEqual(wrong_state.exception.status_code, 409)

    def test_changes_requested_can_be_edited_and_rejected(self):
        leader = main.Actor(role="station_leader", name="Leader")
        logistics = main.Actor(role="logistics", name="Logistics")
        management = main.Actor(role="management", name="Management")
        request = main.create_requisition(main.RequisitionCreate(
            station_id="bharati-demo", quantity=20, reason="Demo request", actor=leader,
        ))
        request_id = request["requisition_id"]
        main.submit_requisition(request_id, main.WorkflowAction(actor=leader))
        main.review_requisition(request_id, main.WorkflowAction(actor=logistics))
        changed = main.decide_requisition(request_id, main.DecisionAction(
            actor=management, decision="changes_requested", notes="Revise the demo quantity",
        ))
        self.assertEqual(changed["status"], "changes_requested")
        main.update_requisition(request_id, main.RequisitionEdit(
            actor=leader, quantity=25, unit="litres", reason="Revised demo request",
        ))
        main.submit_requisition(request_id, main.WorkflowAction(actor=leader))
        main.review_requisition(request_id, main.WorkflowAction(actor=logistics))
        rejected = main.decide_requisition(request_id, main.DecisionAction(
            actor=management, decision="rejected", notes="Demo rejection",
        ))
        self.assertEqual(rejected["status"], "rejected")

    def test_what_if_scenarios_persist_without_changing_requisition_history(self):
        leader = main.Actor(role="station_leader", name="Leader")
        request = main.create_requisition(main.RequisitionCreate(
            station_id="maitri-demo", quantity=100, reason="Synthetic scenario test", actor=leader,
        ))
        request_id = request["requisition_id"]
        history_before = main.requisition_history(request_id)

        storm = main.set_scenario("storm", "maitri-demo")
        delayed = main.set_delayed_shipment_scenario(
            main.DelayedShipmentScenario(delay_days=10), "maitri-demo",
        )
        repeated_delay = main.get_latest_reading("maitri-demo")
        self.assertEqual(delayed["inventory"]["shipment_eta_in_days"], 31)
        self.assertEqual(delayed["inventory"]["shortfall_days"], 16)
        self.assertEqual(delayed["inventory"]["status"], "risk")
        self.assertEqual(delayed["inventory"], repeated_delay["inventory"])
        self.assertEqual(delayed["what_if_scenario"]["id"], "delayed_shipment")
        self.assertEqual(storm["scenario"], "storm")

        generator = main.set_generator_fault_scenario(
            main.GeneratorFaultScenario(generation_available_percent=40), "maitri-demo",
        )
        repeated_generator = main.get_latest_reading("maitri-demo")
        self.assertEqual(generator["what_if_scenario"], repeated_generator["what_if_scenario"])
        self.assertEqual(generator["power"]["status"], "constrained")
        self.assertGreater(generator["energy"]["fuel_demand_multiplier"], 1)
        self.assertEqual(generator["health"]["inputs"]["scenario"], "generator_fault_during_storm")
        self.assertEqual(generator["alert"]["provenance"], "simulated")

        current_request = main.get_requisition(request_id)
        self.assertEqual(current_request["status"], "draft")
        self.assertEqual(main.requisition_history(request_id), history_before)
        cleared = main.clear_scenario("maitri-demo")
        self.assertNotIn("what_if_scenario", cleared)
        self.assertEqual(cleared["scenario"], "storm")

    def test_delayed_shipment_overlays_dispatched_eta_without_editing_requisition(self):
        leader = main.Actor(role="station_leader", name="Leader")
        logistics = main.Actor(role="logistics", name="Logistics")
        management = main.Actor(role="management", name="Management")
        request = main.create_requisition(main.RequisitionCreate(
            station_id="bharati-demo", quantity=60, reason="Synthetic dispatch test", actor=leader,
        ))
        request_id = request["requisition_id"]
        main.submit_requisition(request_id, main.WorkflowAction(actor=leader))
        main.review_requisition(request_id, main.WorkflowAction(actor=logistics))
        main.decide_requisition(request_id, main.DecisionAction(actor=management, decision="approved"))
        original_eta = datetime.now(timezone.utc) + timedelta(days=5)
        main.dispatch_requisition(request_id, main.DispatchAction(
            actor=logistics, shipment_reference="SYNTHETIC-SHIP-1", eta_at=original_eta,
        ))
        history_before = main.requisition_history(request_id)
        base_outlook = main.get_latest_reading("bharati-demo")["inventory"]

        delayed = main.set_delayed_shipment_scenario(
            main.DelayedShipmentScenario(delay_days=10), "bharati-demo",
        )
        current_request = main.get_requisition(request_id)
        self.assertEqual(delayed["inventory"]["eta_source"], "delayed_shipment_scenario")
        self.assertEqual(
            delayed["inventory"]["shipment_eta_in_days"],
            base_outlook["shipment_eta_in_days"] + 10,
        )
        self.assertEqual(current_request["status"], "dispatched")
        self.assertEqual(current_request["eta_at"], original_eta.isoformat())
        self.assertEqual(main.requisition_history(request_id), history_before)

    def test_requisition_routes_are_in_openapi_contract(self):
        paths = main.app.openapi()["paths"]
        expected = (
            "/api/requisitions", "/api/requisitions/{requisition_id}",
            "/api/requisitions/{requisition_id}/history", "/api/requisitions/{requisition_id}/update",
            "/api/requisitions/{requisition_id}/submit",
            "/api/requisitions/{requisition_id}/review", "/api/requisitions/{requisition_id}/decision",
            "/api/requisitions/{requisition_id}/dispatch", "/api/requisitions/{requisition_id}/eta",
            "/api/requisitions/{requisition_id}/delivery", "/api/requisitions/{requisition_id}/close",
            "/api/scenarios/generator-fault", "/api/scenarios/delayed-shipment", "/api/scenarios/clear",
        )
        self.assertTrue(all(path in paths for path in expected))
