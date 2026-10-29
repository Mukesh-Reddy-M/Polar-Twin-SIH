# Synthetic alerts and station health

`GET /api/station/latest?station_id=...` returns an explainable `alert` object and a `health` object calculated from the selected station profile after storm/reset, generator-fault, delayed-shipment, and dispatched-ETA overlays have been applied. The API stores only its derived alert timer and previous score in SQLite `station_assessments`. These assessments do not write to requisitions, shipment ETA records, or workflow history.

Every alert input, health component, and score is labeled `provenance: "simulated"` and `illustrative: true`. These values are synthetic examples, not live readings, validated safety measures, or operational guidance. The rule version is `demo-alerts-v1`.

## Alert levels and promotion thresholds

The highest matching level is the candidate level. Any one matching condition is enough; Critical takes precedence over Warning.

| Candidate | Condition (any one) |
|---|---|
| Warning | Storm severity ≥ 70%; generation availability ≤ 60%; fuel reserve ≤ 65%; shipment ETA is on/before estimated stock-out; or arrival buffer ≤ 7 days |
| Critical | Storm severity ≥ 90%; generation availability ≤ 25%; fuel reserve ≤ 45%; or shipment ETA is at least 7 days after estimated stock-out |
| Normal | No Warning or Critical condition is true |

Promotion requires the same candidate level to remain active for **10 seconds**. If the candidate changes or clears, its timer restarts or is canceled. Normal can promote directly to Critical after the Critical condition persists for the same duration.

## Recovery hysteresis

Alert recovery uses lower-risk thresholds distinct from promotion thresholds. All conditions in a row must remain true for **20 seconds**; otherwise the recovery timer resets.

| Current level | Recovery target | Conditions required together |
|---|---|---|
| Critical | Warning | Storm severity < 85%; generation availability > 35%; fuel reserve > 50%; shipment shortfall < 3 days |
| Warning | Normal | Storm severity < 60%; generation availability > 70%; fuel reserve ≥ 70%; no stock-out-before-arrival risk; arrival buffer > 10 days |

Recovery proceeds one level at a time, so Critical first recovers to Warning and then must satisfy the Warning-to-Normal conditions for another 20 seconds. The API response exposes the active level, candidate level, input values, contributing thresholds, pending transition, and its configured duration. The local dashboard polls every two seconds so the duration can be observed during a demo; the API remains authoritative and persists the timer across requests and restarts.

## Health score

Each component is clamped to 0–100 and rounded to an integer. The overall score is the weighted average, rounded to an integer. All four weights are equal at 25%.

| Component | Calculation |
|---|---|
| Energy | `clamp(100 − max(0, heating_load_kw / baseline_heating_load_kw − 1) × 50, 0, 100)` |
| Infrastructure | Current illustrative available generation percentage |
| Inventory | If stock-out is before/on arrival: `clamp(50 − shortfall_days × 5, 0, 100)`; otherwise `clamp(70 + min(arrival_buffer_days, 10) × 3, 0, 100)` |
| Environment | `clamp(100 × (1 − storm_severity_fraction), 0, 100)` |

`health.score = round(0.25 × energy + 0.25 × infrastructure + 0.25 × inventory + 0.25 × environment)`.
The response includes each component's score, weight, reason, contributing synthetic inputs, overall score change, and a short explanation naming the largest changed component. The dashboard keeps the most recent change explanation visible while the score remains unchanged.

## API response example

```json
{
  "alert": {
    "level": "normal",
    "target_level": "warning",
    "reason": "No alert promotion threshold is currently met; conditions are synthetic demo values.",
    "contributors": [],
    "pending_transition": "Warning promotion needs 8 more seconds of sustained conditions.",
    "pending": {"type": "promotion", "to_level": "warning", "since": "2026-10-29T00:00:00+00:00"},
    "rule_version": "demo-alerts-v1",
    "provenance": "simulated",
    "illustrative": true
  },
  "health": {
    "score": 96,
    "weights": {"energy": 0.25, "infrastructure": 0.25, "inventory": 0.25, "environment": 0.25},
    "provenance": "simulated",
    "illustrative": true
  }
}
```

The API returns additional rule thresholds, contributing input values, component reasons, formula, and score-change details beyond the shortened example above.
