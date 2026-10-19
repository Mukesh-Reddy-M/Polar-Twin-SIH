"""Unit tests for the deterministic synthetic station profiles."""

from datetime import datetime, timezone
import unittest

from polar_twin.simulator import STATIONS, fuel_outlook, make_reading


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
