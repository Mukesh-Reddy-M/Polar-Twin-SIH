"""Small, deterministic scenario model for the first Polar Twin prototype."""

from datetime import datetime, timezone


def make_reading(storm_active: bool = False) -> dict:
    """Return demo readings. Values are illustrative, not station measurements."""
    if storm_active:
        storm_severity = 0.82
        temperature_c = -29
        heating_load_kw = 48
        fuel_percent = 62
        alert = {
            "level": "warning",
            "reason": (
                "Storm severity is high. In this demo scenario, heating demand "
                "and fuel use increase together."
            ),
        }
    else:
        storm_severity = 0.18
        temperature_c = -22
        heating_load_kw = 31
        fuel_percent = 70
        alert = {"level": "normal", "reason": "No active demo warning."}

    return {
        "station_id": "maitri-demo",
        "station_name": "Maitri demo station",
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": "simulated",
        "scenario": "storm" if storm_active else "normal",
        "weather": {
            "storm_severity": storm_severity,
            "temperature_c": temperature_c,
        },
        "energy": {
            "heating_load_kw": heating_load_kw,
            "fuel_percent": fuel_percent,
        },
        "alert": alert,
        "assumptions": [
            "All values are illustrative synthetic demo values.",
            "Alert thresholds are examples and are not operational guidance.",
        ],
    }
