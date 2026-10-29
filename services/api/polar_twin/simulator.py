"""Small, deterministic scenario model for the first Polar Twin prototype."""

from datetime import datetime, timedelta, timezone
from math import ceil
from typing import Optional

GENERATOR_FAULT_DEFAULTS = {
    "generation_available_percent": 40,
    "constrained_power_threshold_percent": 60,
    "backup_fuel_demand_increase_per_lost_fraction": 0.5,
    "backup_heating_load_increase_fraction": 0.25,
}

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


def station_profile(station_id: str) -> dict:
    """Return a known demo profile or raise a clear error for callers."""
    try:
        return STATIONS[station_id]
    except KeyError as error:
        raise ValueError(f"Unknown station profile: {station_id}") from error


def fuel_outlook(
    stockout_days: int,
    shipment_eta_days: int,
    observed_at: datetime,
) -> dict:
    """Calculate the illustrative fuel-arrival comparison for a scenario.

    Arrival on the predicted stock-out day is deliberately considered a risk:
    this prototype does not assume a same-day delivery can prevent a stock-out.
    """
    if stockout_days < 0 or shipment_eta_days < 0:
        raise ValueError("Fuel and shipment estimates must be non-negative days")

    stockout_is_risk = stockout_days <= shipment_eta_days
    return {
        "item": "Heating fuel",
        "stockout_in_days": stockout_days,
        "stockout_date": (observed_at + timedelta(days=stockout_days)).date().isoformat(),
        "shipment_eta_in_days": shipment_eta_days,
        "shipment_eta_date": (observed_at + timedelta(days=shipment_eta_days)).date().isoformat(),
        "status": "risk" if stockout_is_risk else "on_track",
        "shortfall_days": max(0, shipment_eta_days - stockout_days),
        "arrival_buffer_days": max(0, stockout_days - shipment_eta_days),
    }


def make_reading(
    station_id: str = "maitri-demo",
    storm_active: bool = False,
    observed_at: Optional[datetime] = None,
    seed: Optional[int] = None,
) -> dict:
    """Return illustrative synthetic readings for one demo station.

    Profiles currently use fixed lookup values rather than random sampling.
    ``seed`` is carried as run metadata so fixed-input runs can be identified
    and compared; it does not add variation to the current deterministic model.
    """
    station = station_profile(station_id)
    values = station["storm" if storm_active else "baseline"]
    observed_at = observed_at or datetime.now(timezone.utc)
    stockout_days = values["fuel_stockout_days"]
    shipment_eta_days = values["shipment_eta_days"]

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

    reading = {
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
        "power": {
            "status": "steady",
            "available_generation_percent": 100,
            "backup_generation_active": False,
        },
        "inventory": fuel_outlook(stockout_days, shipment_eta_days, observed_at),
        "assumptions": [
            "All values are illustrative synthetic demo values.",
            "Inventory quantities and shipment dates are illustrative planning estimates, not verified schedules.",
            "Alert thresholds are examples and are not operational guidance.",
        ],
    }
    if seed is not None:
        reading["simulation_seed"] = seed
    return reading


def apply_generator_fault(reading: dict, generation_available_percent: int = 40) -> dict:
    """Apply a repeatable synthetic generator fault to an elevated-storm reading."""
    if not 0 <= generation_available_percent <= 100:
        raise ValueError("Generation availability must be from 0 to 100 percent")
    if reading.get("scenario") != "storm":
        raise ValueError("Generator fault scenario requires an active storm profile")

    result = {**reading, "energy": dict(reading["energy"]), "inventory": dict(reading["inventory"])}
    inputs = {
        "storm_severity_percent": round(reading["weather"]["storm_severity"] * 100),
        "generation_available_percent": generation_available_percent,
        "constrained_power_threshold_percent": GENERATOR_FAULT_DEFAULTS["constrained_power_threshold_percent"],
        "backup_fuel_demand_increase_per_lost_fraction": GENERATOR_FAULT_DEFAULTS["backup_fuel_demand_increase_per_lost_fraction"],
        "backup_heating_load_increase_fraction": GENERATOR_FAULT_DEFAULTS["backup_heating_load_increase_fraction"],
    }
    lost_generation_fraction = 1 - generation_available_percent / 100
    fuel_demand_multiplier = 1 + lost_generation_fraction * GENERATOR_FAULT_DEFAULTS[
        "backup_fuel_demand_increase_per_lost_fraction"
    ]
    base_heating_load_kw = reading["energy"]["heating_load_kw"]
    backup_load_kw = ceil(
        base_heating_load_kw * lost_generation_fraction * GENERATOR_FAULT_DEFAULTS[
            "backup_heating_load_increase_fraction"
        ]
    )
    result["energy"].update({
        "heating_load_kw": base_heating_load_kw + backup_load_kw,
        "storm_heating_load_kw": base_heating_load_kw,
        "backup_load_kw": backup_load_kw,
        "fuel_demand_multiplier": round(fuel_demand_multiplier, 2),
    })
    result["power"] = {
        "status": "constrained" if generation_available_percent < inputs["constrained_power_threshold_percent"] else "steady",
        "available_generation_percent": generation_available_percent,
        "backup_generation_active": generation_available_percent < 100,
        "illustrative_threshold_percent": inputs["constrained_power_threshold_percent"],
    }
    original_stockout_days = reading["inventory"]["stockout_in_days"]
    adjusted_stockout_days = ceil(original_stockout_days / fuel_demand_multiplier)
    result["inventory"] = fuel_outlook(
        adjusted_stockout_days,
        reading["inventory"]["shipment_eta_in_days"],
        datetime.fromisoformat(reading["observed_at"].replace("Z", "+00:00")),
    )
    result["what_if_scenario"] = {
        "id": "generator_fault_during_storm",
        "title": "Generator fault during storm",
        "provenance": "simulated_what_if",
        "inputs": inputs,
        "effects": {
            "power_status": result["power"]["status"],
            "backup_generation_active": result["power"]["backup_generation_active"],
            "storm_heating_load_kw": base_heating_load_kw,
            "heating_load_kw": result["energy"]["heating_load_kw"],
            "fuel_demand_multiplier": result["energy"]["fuel_demand_multiplier"],
            "stockout_days_before_fault": original_stockout_days,
            "stockout_days_after_fault": adjusted_stockout_days,
        },
        "explanation": (
            "The storm profile stays active. Reduced generation adds an illustrative backup load, "
            "raises modeled fuel demand, and shortens the synthetic stock-out estimate."
        ),
    }
    result["assumptions"] = list(reading.get("assumptions", [])) + [
        "Generator availability, backup load, fuel-demand multiplier, and constrained-power threshold are illustrative scenario inputs, not station measurements."
    ]
    return result


def apply_delayed_shipment(reading: dict, delay_days: int = 10) -> dict:
    """Move the current synthetic shipment ETA later without editing requisitions."""
    if not 1 <= delay_days <= 90:
        raise ValueError("Shipment delay must be from 1 to 90 days")
    result = {**reading, "inventory": dict(reading["inventory"])}
    inventory = reading["inventory"]
    eta_before_days = inventory["shipment_eta_in_days"]
    calculated_at = datetime.fromisoformat(
        inventory.get("calculated_at", reading["observed_at"]).replace("Z", "+00:00")
    )
    current_eta_at = inventory.get("shipment_eta_at")
    if current_eta_at:
        current_eta_at = datetime.fromisoformat(current_eta_at.replace("Z", "+00:00"))
    else:
        current_eta_at = calculated_at + timedelta(days=eta_before_days)
    scenario_eta_at = current_eta_at + timedelta(days=delay_days)
    eta_after_days = max(0, ceil((scenario_eta_at - calculated_at).total_seconds() / 86400))
    result["inventory"] = fuel_outlook(
        inventory["stockout_in_days"], eta_after_days, calculated_at
    )
    result["inventory"]["eta_source"] = "delayed_shipment_scenario"
    result["inventory"]["shipment_eta_at"] = scenario_eta_at.isoformat()
    result["inventory"]["calculated_at"] = calculated_at.isoformat()
    result["what_if_scenario"] = {
        "id": "delayed_shipment",
        "title": "Delayed shipment",
        "provenance": "simulated_what_if",
        "inputs": {
            "baseline_eta_in_days": eta_before_days,
            "delay_days": delay_days,
            "scenario_eta_in_days": eta_after_days,
        },
        "effects": {
            "stockout_in_days": result["inventory"]["stockout_in_days"],
            "arrival_buffer_days": result["inventory"]["arrival_buffer_days"],
            "shortfall_days": result["inventory"]["shortfall_days"],
            "outlook_status": result["inventory"]["status"],
        },
        "explanation": (
            f"The shipment ETA is shifted {delay_days} illustrative days later for this what-if only. "
            "The requisition ETA and its workflow history are unchanged."
        ),
    }
    result["assumptions"] = list(reading.get("assumptions", [])) + [
        "Shipment delay is a synthetic what-if input and does not change a dispatched requisition or verified delivery schedule."
    ]
    return result
