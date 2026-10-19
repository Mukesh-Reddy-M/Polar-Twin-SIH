# Polar Twin: build plan

This plan turns the current proposal into a demoable MVP. The source concept estimates an eight-week build by a six-person team; treat that as an initial planning assumption and adjust it to the actual SIH schedule and team capacity.

## First decisions (Day 1)

1. Confirm team members, owner for each workstream, and the event deadline.
2. Pick one API stack. Recommended starting choice: FastAPI, because the simulator is Python and can share models and validation.
3. Agree on the first judge journey: storm → energy/fuel impact → alert → low-bandwidth sync → supply risk → management summary.
4. Freeze Must / Should / Could scope. Keep 3D visualization, real hardware integrations, and advanced prediction out of the first demo.
5. Write down that all initial readings are simulated/public-derived and thresholds are illustrative.

## Milestones

### 1. Definition and contracts

- Create 3-5 user stories for Station Leader, Logistics, and Management.
- Define success checks: a scenario completes end-to-end, data provenance is visible, queued data syncs after reconnect, and each alert gives a reason.
- Write a data dictionary and sample JSON for station, telemetry, inventory, alert, requisition, shipment, and scenario.
- Decide units, timestamps, timezone handling, and validation ranges.

**Deliverable:** agreed MVP, data dictionary, example payloads, API contract.

### 2. Data and simulator

- Build deterministic synthetic baseline data for two station profiles.
- Model linked effects: storm severity increases heating load and generator use, which increases fuel consumption and changes time-to-empty.
- Add controllable events for generator failure and shipment delay.
- Keep a fixed random seed option so the demo is repeatable.
- If public weather data is used, record source, retrieval date, license/terms, and how it calibrates synthetic values.

**Deliverable:** repeatable scenario generator and sample dataset with provenance.

### 3. Ingestion and storage

- Implement one ingestion endpoint shared by simulator and future sensor adapters.
- Validate schema, units, ranges, timestamps, and provenance.
- Store telemetry and operational records in PostgreSQL.
- Implement an edge-agent demo that queues records, compresses batches, prioritizes alerts, then syncs on reconnect.

**Deliverable:** local end-to-end data path with an observable bytes-sent / queued count.

### 4. Alerts and operations logic

- Start with a small configuration-backed rule set.
- Add hysteresis and minimum durations to avoid alert flapping.
- Explain each alert with input values, threshold, and contributing rule.
- Calculate health score from named components and show why it changed.
- Compare projected stock-out date with shipment ETA; show assumptions and uncertainty.
- Require a human approval step for critical operational actions.

**Deliverable:** testable rules and transparent health / stock risk calculations.

### 5. Operator interface

- Build station overview and 2D station/map view.
- Add history and provenance details to each key reading.
- Add logistics workflow and role-specific management summary.
- Add scenario controls that run against a copy of state, not the live demo state.
- Export a compact CSV or PDF report.

**Deliverable:** complete click-through judge journey on a local build.

### 6. Hardening and demo

- Exercise offline, reconnect, duplicate batch, invalid reading, stale timestamp, and scenario reset paths.
- Prepare local/offline mode, screenshots, and a short recorded fallback.
- Rehearse the demo from a clean start and keep it within the SIH presentation time limit.
- Verify station facts and external claims against official sources before presenting them as facts.

**Deliverable:** repeatable demo, known limitations, and fallback materials.

## Suggested six-person split

| Role | Owns |
|---|---|
| Product/demo lead | MVP, judge story, integration schedule, presentation |
| Simulator/data | synthetic generator, public-source calibration, provenance |
| API/data model | ingestion contract, validation, PostgreSQL |
| Edge/offline | buffering, compression, reconnect, sync visibility |
| Web: station view | overview, health, alerts, map |
| Web: logistics/QA | order workflow, scenario/report UX, integration checks |

Pair on cross-cutting work; one person should own final integration and release decisions.

## Suggested weekly cadence

- Start of week: agree on one demonstrable outcome and owners.
- Midweek: integrate to the main branch; resolve interface changes early.
- End of week: demo from a clean checkout, record gaps, and trim scope.

## Backlog after MVP

- Real sensor adapters (MQTT/Modbus) only with approved access and verified data contracts.
- More detailed station geometry or 3D view.
- Advanced forecasting after baseline assumptions can be validated.
- Additional stations, ships, or field camps after the two-station flow works.
