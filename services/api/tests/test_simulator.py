"""Unit tests for the deterministic synthetic station profiles."""

from datetime import datetime, timezone
import unittest

from polar_twin.simulator import (
    STATIONS,
    apply_delayed_shipment,
    apply_generator_fault,
    fuel_outlook,
    make_reading,
)


class SimulatorTests(unittest.TestCase):
    def test_normal_profiles_are_synthetic_and_on_track(self):
        for station_id, profile in STATIONS.items():
            with self.subTest(station_id=station_id):
                reading = make_reading(station_id)
                self.assertEqual(reading["station_id"], station_id)
                self.assertEqual(reading["station_label"], profile["label"])
                self.assertEqual(reading["provenance"], "simulated")
                self.assertEqual(reading["scenario"], "normal")
                self.assertEqual(reading["alert"]["level"], "normal")
                self.assertEqual(reading["energy"]["heating_load_kw"], profile["baseline"]["heating_load_kw"])
                self.assertEqual(reading["energy"]["fuel_percent"], profile["baseline"]["fuel_percent"])
                self.assertEqual(reading["inventory"]["status"], "on_track")

    def test_storm_profiles_raise_heating_and_create_explainable_risk(self):
        for station_id, profile in STATIONS.items():
            with self.subTest(station_id=station_id):
                normal = make_reading(station_id)
                storm = make_reading(station_id, storm_active=True)
                self.assertEqual(storm["scenario"], "storm")
                self.assertEqual(storm["alert"]["level"], "warning")
                self.assertIn("Storm severity is high", storm["alert"]["reason"])
                self.assertEqual(storm["weather"]["storm_severity"], profile["storm"]["storm_severity"])
                self.assertGreater(storm["energy"]["heating_load_kw"], normal["energy"]["heating_load_kw"])
                self.assertLess(storm["energy"]["fuel_percent"], normal["energy"]["fuel_percent"])
                self.assertEqual(storm["inventory"]["status"], "risk")

    def test_fuel_outlook_policy_and_non_negative_gaps(self):
        observed_at = datetime(2026, 10, 19, tzinfo=timezone.utc)
        cases = (
            (4, 8, "risk", 4, 0),   # stock-out before shipment
            (8, 8, "risk", 0, 0),   # same-day arrival is still a risk
            (12, 8, "on_track", 0, 4),
        )
        for stockout, shipment, status, shortfall, buffer in cases:
            with self.subTest(stockout=stockout, shipment=shipment):
                result = fuel_outlook(stockout, shipment, observed_at)
                self.assertEqual(result["status"], status)
                self.assertEqual(result["shortfall_days"], shortfall)
                self.assertEqual(result["arrival_buffer_days"], buffer)
                self.assertGreaterEqual(result["shortfall_days"], 0)
                self.assertGreaterEqual(result["arrival_buffer_days"], 0)

    def test_invalid_station_and_negative_estimates_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown station profile"):
            make_reading("unknown-demo")
        with self.assertRaisesRegex(ValueError, "non-negative"):
            fuel_outlook(-1, 4, datetime.now(timezone.utc))

    def test_generator_fault_during_storm_is_repeatable_and_increases_fuel_demand(self):
        storm = make_reading("maitri-demo", storm_active=True)
        first = apply_generator_fault(storm, generation_available_percent=40)
        repeated = apply_generator_fault(storm, generation_available_percent=40)

        self.assertEqual(first["what_if_scenario"], repeated["what_if_scenario"])
        self.assertEqual(first["power"]["status"], "constrained")
        self.assertTrue(first["power"]["backup_generation_active"])
        self.assertEqual(first["power"]["available_generation_percent"], 40)
        self.assertGreater(first["energy"]["heating_load_kw"], storm["energy"]["heating_load_kw"])
        self.assertGreater(first["energy"]["fuel_demand_multiplier"], 1)
        self.assertLess(first["inventory"]["stockout_in_days"], storm["inventory"]["stockout_in_days"])
        self.assertEqual(first["provenance"], "simulated")
        self.assertEqual(first["what_if_scenario"]["provenance"], "simulated_what_if")

    def test_delayed_shipment_recomputes_stockout_buffer_and_shortfall_repeatably(self):
        storm = make_reading("maitri-demo", storm_active=True)
        first = apply_delayed_shipment(storm, delay_days=10)
        repeated = apply_delayed_shipment(storm, delay_days=10)

        self.assertEqual(first["what_if_scenario"], repeated["what_if_scenario"])
        self.assertEqual(first["inventory"]["shipment_eta_in_days"], 31)
        self.assertEqual(first["inventory"]["status"], "risk")
        self.assertEqual(first["inventory"]["shortfall_days"], 16)
        self.assertEqual(first["inventory"]["arrival_buffer_days"], 0)
        self.assertEqual(first["inventory"]["eta_source"], "delayed_shipment_scenario")

    def test_scenario_parameters_are_validated(self):
        storm = make_reading("maitri-demo", storm_active=True)
        with self.assertRaisesRegex(ValueError, "0 to 100"):
            apply_generator_fault(storm, generation_available_percent=101)
        with self.assertRaisesRegex(ValueError, "requires an active storm"):
            apply_generator_fault(make_reading("maitri-demo"), generation_available_percent=40)
        with self.assertRaisesRegex(ValueError, "1 to 90"):
            apply_delayed_shipment(storm, delay_days=0)
