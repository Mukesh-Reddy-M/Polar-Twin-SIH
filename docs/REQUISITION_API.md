# Requisition workflow API contract

The API owns requisition state and validates every state change. The browser role selector supplies a **demo role label** so the API can demonstrate role-specific actions. It is not identity verification or real authorization; do not use this API for station operations.

All timestamps are ISO 8601 and must include a timezone. Responses and event history use UTC timestamps. Request, shipment, delivery, actor, and ETA values entered through this prototype are demo records. Telemetry and stock-out calculations remain synthetic; estimates are not validated operational guidance.

## State flow

```text
draft --Station Leader: submit--> submitted
submitted --Logistics: review--> in_review
in_review --Management: decision--> approved | rejected | changes_requested
changes_requested --Station Leader: submit--> submitted
approved --Logistics: dispatch--> dispatched
dispatched --Logistics: ETA update--> dispatched
dispatched --Station Leader: confirm delivery--> delivered
delivered --Station Leader: close--> closed
```

Only the API changes the stored state. An invalid state transition returns `409`; a demo role that cannot perform an action returns `403`; an unknown station or request returns `404`; invalid fields return `422`. Rejected and closed requests are terminal in this MVP.

## Endpoints

All paths are under `/api`. The API is served at `http://localhost:8000` in local development.

| Method and path | Role | Purpose |
|---|---|---|
| `POST /requisitions` | Station Leader | Create a `draft` request |
| `GET /requisitions?station_id=&status=` | Any demo view | List requests, optionally filtered |
| `GET /requisitions/{id}` | Any demo view | Read current request |
| `GET /requisitions/{id}/history` | Any demo view | Read ordered, append-only action history |
| `POST /requisitions/{id}/update` | Station Leader | Edit a `draft` or `changes_requested` request |
| `POST /requisitions/{id}/submit` | Station Leader | `draft` or `changes_requested` → `submitted` |
| `POST /requisitions/{id}/review` | Logistics | `submitted` → `in_review` |
| `POST /requisitions/{id}/decision` | Management | `in_review` → approved, rejected, or changes requested |
| `POST /requisitions/{id}/dispatch` | Logistics | `approved` → `dispatched`, attach shipment reference and ETA |
| `POST /requisitions/{id}/eta` | Logistics | Update a dispatched shipment ETA and append an event |
| `POST /requisitions/{id}/delivery` | Station Leader | `dispatched` → `delivered`, record received quantity/time |
| `POST /requisitions/{id}/close` | Station Leader | `delivered` → `closed` |

### Create request

```json
{
  "station_id": "maitri-demo",
  "item_id": "heating-fuel",
  "quantity": 1000,
  "unit": "litres",
  "reason": "Synthetic storm-response demo request",
  "linked_alert_id": "demo-maitri-demo-storm",
  "actor": { "role": "station_leader", "name": "Station Leader (demo)" }
}
```

`item_id`, `unit`, and `linked_alert_id` are optional where defined by the API schema. Quantity must be positive. Creation records a draft and a `created` history event; call `/submit` to send it for review.

### Action body

Most actions accept:

```json
{
  "actor": { "role": "logistics", "name": "Logistics (demo)" },
  "notes": "Optional demo note"
}
```

The decision endpoint adds `decision` with one of `approved`, `rejected`, or `changes_requested`. Dispatch adds `shipment_reference`, optional `dispatched_at`, and required `eta_at`. ETA update takes a required `eta_at`. Delivery adds `received_quantity` and optional `delivered_at`.

The edit endpoint accepts `actor`, `quantity`, `unit`, and `reason`; it does not change the current state and appends an `updated` event. A Station Leader can then submit a draft or a request with changes requested.

## Event history and provenance

Each create/action transaction updates the current requisition and appends an event in SQLite. Events contain `occurred_at`, `actor` (`role`, `name`), `action`, `notes`, `provenance`, and transition details. ETA updates append another event and never rewrite older event records. Provenance is `manual_demo_action` for actions and `manual_demo_entry` for created request values. Synthetic telemetry is separately labeled `simulated`.

## Shipment ETA and stock-out comparison

The current `GET /station/latest?station_id=...` response keeps the existing weather, energy, storm/reset, and inventory fields. When that station has a requisition in `dispatched` state, its latest ETA replaces the profile ETA for `inventory.shipment_eta_in_days` and `shipment_eta_date`; the response includes `eta_source: "dispatched_requisition"` and `shipment_eta_at`. The same existing stock-out comparison then reports its illustrative risk/shortfall or arrival buffer. The dispatched request supplies an ETA only until it reaches delivery; profile synthetic ETA is used otherwise.

The separate delayed-shipment what-if may add an illustrative delay to that current ETA for comparison. It never edits the requisition or its event history. The generator-fault what-if changes only synthetic energy/power and stock-out estimates. See [SCENARIO_API.md](SCENARIO_API.md) for scenario endpoints and assumptions.

The same latest-reading response also includes persisted Normal / Warning / Critical alert assessment and a 0–100 component health score. These are derived from the final active scenario and ETA overlay, are labeled synthetic, and do not change requisition or shipment state. See [ALERTS_HEALTH.md](ALERTS_HEALTH.md) for exact thresholds, hysteresis durations, score weights, and formulas.

## Storage

SQLite tables `requisitions` and `requisition_events` are created alongside the existing `readings` table. Data remains local under `services/api/data/` by default. Event append-only behavior is enforced by the API surface and transaction code; demo role labels are not a security boundary.
