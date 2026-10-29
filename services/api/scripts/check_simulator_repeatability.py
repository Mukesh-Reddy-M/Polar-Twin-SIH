#!/usr/bin/env python3
"""Check fixed station/scenario inputs produce identical seeded readings."""

from datetime import datetime, timezone
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from polar_twin.simulator import (  # noqa: E402
    STATIONS,
    apply_delayed_shipment,
    apply_generator_fault,
    make_reading,
)


SEED = 26060
OBSERVED_AT = datetime(2026, 10, 29, 12, 0, tzinfo=timezone.utc)


def build_cases():
    for station_id in STATIONS:
        yield station_id, "normal", lambda station_id=station_id: make_reading(
            station_id, observed_at=OBSERVED_AT, seed=SEED
        )
        yield station_id, "storm", lambda station_id=station_id: make_reading(
            station_id, storm_active=True, observed_at=OBSERVED_AT, seed=SEED
        )

        def generator_fault(station_id=station_id):
            storm = make_reading(station_id, storm_active=True, observed_at=OBSERVED_AT, seed=SEED)
            return apply_generator_fault(storm, generation_available_percent=40)

        def delayed_shipment(station_id=station_id):
            storm = make_reading(station_id, storm_active=True, observed_at=OBSERVED_AT, seed=SEED)
            return apply_delayed_shipment(storm, delay_days=10)

        yield station_id, "generator_fault_during_storm", generator_fault
        yield station_id, "delayed_shipment", delayed_shipment


def main():
    count = 0
    for station_id, scenario_id, build in build_cases():
        first = build()
        repeated = build()
        assert first == repeated, f"Non-repeatable output: {station_id} / {scenario_id}"
        assert first["station_id"] == station_id
        assert first["simulation_seed"] == SEED
        assert first["provenance"] == "simulated"
        count += 1
    print(f"Simulator repeatability passed: {count} fixed station/scenario cases (seed={SEED}).")
    print("Current profiles are lookup-based and deterministic; the seed is run metadata, not random variation.")


if __name__ == "__main__":
    main()
