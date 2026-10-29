"""Deterministic demo alert and station-health rule tests."""

import unittest
from datetime import datetime, timedelta, timezone

from polar_twin import main
from polar_twin.simulator import apply_delayed_shipment, apply_generator_fault, make_reading


class AlertHealthTests(unittest.TestCase):
    def at(self, seconds=0):
        return datetime(2026, 10, 29, tzinfo=timezone.utc) + timedelta(seconds=seconds)

    def test_normal_warning_and_critical_levels_use_documented_inputs(self):
        normal = make_reading("maitri-demo")
        warning = make_reading("bharati-demo", storm_active=True)
        critical = apply_delayed_shipment(make_reading("maitri-demo", storm_active=True), 10)

        self.assertEqual(main.classify_promotion(main._reading_inputs(normal))[0], "normal")
        self.assertEqual(main.classify_promotion(main._reading_inputs(warning))[0], "warning")
        self.assertEqual(main.classify_promotion(main._reading_inputs(critical))[0], "critical")

    def test_alert_promotion_requires_ten_continuous_seconds(self):
        warning = make_reading("bharati-demo", storm_active=True)
        first, state = main.evaluate_alert(warning, now=self.at())
        before, state = main.evaluate_alert(warning, state, self.at(9))
        promoted, state = main.evaluate_alert(warning, state, self.at(10))

        self.assertEqual(first["level"], "normal")
        self.assertEqual(first["target_level"], "warning")
        self.assertEqual(before["level"], "normal")
        self.assertIn("1 more seconds", before["pending_transition"])
        self.assertEqual(promoted["level"], "warning")
        self.assertIn("promoted", promoted["pending_transition"])

    def test_condition_must_remain_present_to_promote(self):
        warning = make_reading("bharati-demo", storm_active=True)
        normal = make_reading("maitri-demo")
        _, state = main.evaluate_alert(warning, now=self.at())
        reset, state = main.evaluate_alert(normal, state, self.at(5))
        self.assertEqual(reset["level"], "normal")
        self.assertIsNone(reset["pending"])
        self.assertEqual(state["pending_since"], None)

    def test_recovery_uses_separate_threshold_and_twenty_second_duration(self):
        critical_reading = apply_delayed_shipment(make_reading("maitri-demo", storm_active=True), 10)
        clear_reading = make_reading("maitri-demo")
        _, state = main.evaluate_alert(critical_reading, now=self.at())
        critical, state = main.evaluate_alert(critical_reading, state, self.at(10))
        self.assertEqual(critical["level"], "critical")

        recovering, state = main.evaluate_alert(clear_reading, state, self.at(11))
        self.assertEqual(recovering["level"], "critical")
        self.assertEqual(recovering["pending"]["type"], "recovery")
        still_critical, state = main.evaluate_alert(clear_reading, state, self.at(30))
        self.assertEqual(still_critical["level"], "critical")
        recovered_warning, state = main.evaluate_alert(clear_reading, state, self.at(31))
        self.assertEqual(recovered_warning["level"], "warning")
        self.assertIn("below recovery thresholds", recovered_warning["pending_transition"])
        # A warning needs its own complete recovery period before returning to normal.
        _, state = main.evaluate_alert(clear_reading, state, self.at(32))
        warning, state = main.evaluate_alert(clear_reading, state, self.at(52))
        self.assertEqual(warning["level"], "normal")

    def test_health_component_formula_weights_and_scenario_inputs(self):
        baseline = make_reading("maitri-demo")
        score = main.calculate_health(baseline)
        self.assertEqual(score["components"]["energy"]["score"], 100)
        self.assertEqual(score["components"]["infrastructure"]["score"], 100)
        self.assertEqual(score["components"]["inventory"]["score"], 100)
        self.assertEqual(score["components"]["environment"]["score"], 82)
        self.assertEqual(score["score"], 96)
        self.assertEqual(sum(score["weights"].values()), 1)

        storm = make_reading("maitri-demo", storm_active=True)
        fault = apply_generator_fault(storm, 40)
        fault_health = main.calculate_health(fault, score)
        delayed = apply_delayed_shipment(storm, 10)
        delayed_health = main.calculate_health(delayed, score)
        self.assertEqual(fault_health["components"]["infrastructure"]["score"], 40)
        self.assertLess(fault_health["components"]["energy"]["score"], 100)
        self.assertLess(delayed_health["components"]["inventory"]["score"], 50)
        self.assertEqual(fault_health["inputs"]["scenario"], "generator_fault_during_storm")
        self.assertEqual(delayed_health["inputs"]["scenario"], "delayed_shipment")
        self.assertEqual(fault_health["provenance"], "simulated")
        self.assertIn("Score fell", fault_health["change_reason"])

    def test_alert_assessment_is_repeatable_for_same_inputs_and_time(self):
        reading = apply_delayed_shipment(make_reading("maitri-demo", storm_active=True), 10)
        first, state = main.evaluate_alert(reading, now=self.at())
        repeated, repeated_state = main.evaluate_alert(reading, now=self.at())
        self.assertEqual(first, repeated)
        self.assertEqual(state, repeated_state)
        health = main.calculate_health(reading)
        self.assertEqual(health, main.calculate_health(reading))


if __name__ == "__main__":
    unittest.main()
