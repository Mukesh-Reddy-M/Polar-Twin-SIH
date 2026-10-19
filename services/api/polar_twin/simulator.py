"""Small, deterministic scenario model for the first Polar Twin prototype."""

from datetime import datetime, timedelta, timezone

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
            "fuel_stockout_days": 34,
            "shipment_eta_days": 21,
        },
        "storm": {
            "storm_severity": 0.82,
            "temperature_c": -29,
            "heating_load_kw": 48,
            "fuel_percent": 62,
            "fuel_stockout_days": 15,
            "shipment_eta_days": 21,
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
            "fuel_stockout_days": 38,
            "shipment_eta_days": 24,
        },
        "storm": {
            "storm_severity": 0.77,
            "temperature_c": -26,
            "heating_load_kw": 42,
            "fuel_percent": 68,
            "fuel_stockout_days": 19,
            "shipment_eta_days": 24,
        },
    },
}


def make_reading(station_id: str = "maitri-demo", storm_active: bool = False) -> dict:
    """Return illustrative synthetic readings for one demo station."""
    station = STATIONS[station_id]
    values = station["storm" if storm_active else "baseline"]
    observed_at = datetime.now(timezone.utc)
    stockout_days = values["fuel_stockout_days"]
    shipment_eta_days = values["shipment_eta_days"]
    stockout_is_risk = stockout_days <= shipment_eta_days

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
        "observed_at": observed_at.isoformat(),
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
        "inventory": {
            "item": "Heating fuel",
            "stockout_in_days": stockout_days,
            "stockout_date": (observed_at + timedelta(days=stockout_days)).date().isoformat(),
            "shipment_eta_in_days": shipment_eta_days,
            "shipment_eta_date": (observed_at + timedelta(days=shipment_eta_days)).date().isoformat(),
            "status": "risk" if stockout_is_risk else "on_track",
            "shortfall_days": max(0, shipment_eta_days - stockout_days),
            "arrival_buffer_days": max(0, stockout_days - shipment_eta_days),
        },
        "assumptions": [
            "All values are illustrative synthetic demo values.",
            "Inventory quantities and shipment dates are illustrative planning estimates, not verified schedules.",
            "Alert thresholds are examples and are not operational guidance.",
        ],
    }
