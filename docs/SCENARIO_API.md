# Synthetic scenario API

The what-if scenarios are repeatable, local demonstrations. Their current parameters are stored per station in SQLite in `active_scenarios`. They are applied as an overlay when the station reading is returned. Scenario selection never changes a requisition, its stored shipment ETA, or requisition event history.

The latest response's alert and health assessment use the resulting active overlay, including the shipment comparison ETA. Alert timing and previous score state are stored in `station_assessments`, separately from scenario and requisition state. The overlay itself does not reset or bypass alert hysteresis. See [ALERTS_HEALTH.md](ALERTS_HEALTH.md) for thresholds and formulas.

All readings and estimates remain synthetic. Scenario inputs, derived values, and thresholds are illustrative only; they are not validated station measurements or operational guidance. The role selector controls which demo buttons are shown, not authorization.

## Endpoints

All endpoints use `/api` and return the updated station reading.

| Method and path | Input | Behavior |
|---|---|---|
| `POST /scenarios/generator-fault?station_id=maitri-demo` | `{"generation_available_percent": 40}` | Activates the storm profile and simulates generator limitation |
| `POST /scenarios/delayed-shipment?station_id=maitri-demo` | `{"delay_days": 10}` | Shifts the comparison ETA later without editing requisitions |
| `POST /scenarios/clear?station_id=maitri-demo` | no body | Removes the what-if overlay; retains the selected normal/storm base profile |
| `POST /scenario/storm?station_id=...` | no body | Selects the storm base profile and clears any what-if overlay |
| `POST /scenario/reset?station_id=...` | no body | Selects the normal base profile and clears any what-if overlay |

`generation_available_percent` accepts 0–100 and defaults to 40. `delay_days` accepts 1–90 and defaults to 10. Parameters are persisted independently per station and re-applied on `GET /station/latest` until cleared or another scenario/base profile is selected.

## Generator fault during storm

The storm profile remains active. For repeatability, the prototype uses these documented illustrative relationships:

- Power is labeled `constrained` below the configured 60% generation availability threshold.
- `backup_load_kw = ceil(storm_heating_load_kw × (1 − available_generation_fraction) × 0.25)`.
- `heating_load_kw = storm_heating_load_kw + backup_load_kw`.
- `fuel_demand_multiplier = 1 + (1 − available_generation_fraction) × 0.5`.
- `stockout_in_days = ceil(storm_profile_stockout_days ÷ fuel_demand_multiplier)`.

The response includes `power`, additional energy fields, an `inventory` outlook, and a `what_if_scenario` object containing inputs, effects, an explanation, and `provenance: "simulated_what_if"`. The thresholds and formulas are chosen for an explainable demo, not calibrated to station systems.

## Delayed shipment

The API takes the current comparison ETA from the active dispatched requisition when one exists; otherwise it uses the selected synthetic station profile. It adds `delay_days` and recalculates the existing inventory outlook (`status`, `shortfall_days`, and `arrival_buffer_days`). The response labels the ETA source `delayed_shipment_scenario` and records the baseline ETA, added delay, and scenario ETA under `what_if_scenario.inputs`.

This is an overlay only: a requisition’s `eta_at`, status, and append-only workflow history remain unchanged. Clearing the scenario restores the un-delayed comparison based on the current requisition or profile state.

## Persistence and repeatability

One active what-if scenario is stored per station in `active_scenarios` with its scenario ID, input parameters, and update time. Applying the same scenario to the same base reading and parameters yields the same derived power, energy, and outlook values. A new selection replaces the active scenario overlay; it does not rewrite workflow events. The underlying station reading snapshot and current requisition are retained separately.
