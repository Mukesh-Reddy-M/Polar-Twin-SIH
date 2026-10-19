"""Small, deterministic scenario model for the first Polar Twin prototype."""

from datetime import datetime, timezone

STATIONS = {
    "maitri-demo": {
        "station_id": "maitri-demo",
        "label": "Maitri",
        "station_name": "Maitri demo station",
        "baseline": {
            "storm_severity": 0.18,
            "temperature_c": -22,
            "heating_load_kw": 31,
            "fuel_percent": 70,
        },
        "storm": {
            "storm_severity": 0.82,
            "temperature_c": -29,
            "heating_load_kw": 48,
            "fuel_percent": 62,
        },
    },
    "bharati-demo": {
        "station_id": "bharati-demo",
        "label": "Bharati",
        "station_name": "Bharati demo station",
        "baseline": {
            "storm_severity": 0.14,
            "temperature_c": -19,
            "heating_load_kw": 27,
            "fuel_percent": 76,
        },
        "storm": {
            "storm_severity": 0.77,
            "temperature_c": -26,
            "heating_load_kw": 42,
            "fuel_percent": 68,
        },
    },
}


def make_reading(station_id: str = "maitri-demo", storm_active: bool = False) -> dict:
    """Return illustrative synthetic readings for one demo station."""
    station = STATIONS[station_id]
    values = station["storm" if storm_active else "baseline"]

    if storm_active:
        alert = {
            "level": "warning",
            "reason": (
                "Storm severity is high. In this demo scenario, heating demand "
                "and fuel use increase together."
            ),
        }
    else:
        alert = {"level": "normal", "reason": "No active demo warning."}

    return {
        "station_id": station_id,
        "station_label": station["label"],
        "station_name": station["station_name"],
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "provenance": "simulated",
        "scenario": "storm" if storm_active else "normal",
        "weather": {
            "storm_severity": values["storm_severity"],
            "temperature_c": values["temperature_c"],
        },
        "energy": {
            "heating_load_kw": values["heating_load_kw"],
            "baseline_heating_load_kw": station["baseline"]["heating_load_kw"],
            "fuel_percent": values["fuel_percent"],
        },
        "alert": alert,
        "assumptions": [
            "All values are illustrative synthetic demo values.",
            "Alert thresholds are examples and are not operational guidance.",
        ],
    }
