# Polar Twin: build plan

This plan turns the current proposal into a demoable MVP. The source concept estimates an eight-week build by a six-person team; treat that as an initial planning assumption and adjust it to the actual SIH schedule and team capacity.

## Current build checkpoint (2026-10-29)

- **Phase 0 — baseline and contracts:** inspected the existing React/Vite, FastAPI, SQLite, and synthetic simulator contracts. The requisition request, action, transition, history, timestamp, role-label, and provenance contract is in [REQUISITION_API.md](REQUISITION_API.md).
- **Phase 1 — workflow foundation:** the local API persists requisition state and append-only events, validates transitions against demo role labels, and returns workflow history. The web demo exposes Station Leader, Logistics, and Management views. A dispatched shipment ETA flows into the existing synthetic stock-out comparison.
- **Phase 2 — scenarios and stock outlook:** repeatable generator-fault-during-storm and delayed-shipment what-ifs are stored separately per station, applied to API reading responses, and surfaced with their inputs and explanations. The first reduces illustrative power availability and increases backup/fuel demand; the second shifts the active comparison ETA without changing a requisition or its event history. **Phase 2 baseline implemented.**
- **Phase 3 — alerts and health:** the latest-reading API now derives persisted Normal/Warning/Critical state with separate promotion and recovery thresholds/timers, plus an equally weighted 0–100 score for energy, infrastructure, inventory, and environment. The UI shows active inputs, contributing conditions, pending time, component scores, and score-change reason. Exact illustrative rules are documented in [ALERTS_HEALTH.md](ALERTS_HEALTH.md). **Phase 3 implemented; checks listed in the task completion summary.**
- **Phase 4 — role views and station twin:** the existing dashboard now embeds an interactive Three.js schematic adapted from the supplied Apache-2.0 model archive. It supports orbit, zoom, reset, selectable zones, a text-list alternative, and a WebGL fallback. API-backed power, fuel, workflow/shipment, alert, and health values are mapped to matching areas; unsupported status stays unknown. Existing station/scenario controls remain authoritative. **Phase 4 integrated; see [STATION_TWIN.md](STATION_TWIN.md).**
- **Phase 5 — reports and offline demo:** client-side CSV and print-to-PDF exports use the current dashboard state and include units, provenance, assumptions, alert/health, stock outlook, and workflow history when available. A read-only seeded mode supports normal, storm, generator-fault, and delayed-shipment stories for both profiles when the API is unavailable. Seeded workflow state is not stored or synced; the existing telemetry queue remains a separate API-mode demo. **Implemented; see [REPORTS_OFFLINE_DEMO.md](REPORTS_OFFLINE_DEMO.md).**
- **Phase 6 — hardening and handoff:** pytest runs the existing requisition, ETA, scenario, alert/health, simulator, and new telemetry-metadata validation checks. A fixed timestamp and seed repeatability command covers both station profiles and all four simulator states. `./scripts/run-local.sh` starts FastAPI and Vite together; GitHub Actions runs API tests, repeatability, and the production build. The README reflects React/Vite/Three.js, FastAPI, and local SQLite. **Implemented; see [DEMO_HANDOFF.md](DEMO_HANDOFF.md).**
- **Preserved prototype behavior:** Maitri/Bharati selection, storm/reset scenarios, offline telemetry queue/sync, and the existing stock outlook remain in place. No live station data or validated operational guidance is provided.
- **Verification:** run `python -m pytest -q services/api/tests`, `python services/api/scripts/check_simulator_repeatability.py`, `npm run build` from `apps/web`, and `git diff --check` from the repository root. The implementation handoff records the latest results.

## First decisions (Day 1)

1. Assign one owner for each workstream and confirm the event deadline and team availability.
2. Pick one API stack. Recommended starting choice: FastAPI, because the simulator is Python and can share models and validation.
3. Agree on the first judge journey: storm → energy/fuel impact → alert → low-bandwidth sync → supply risk → management summary.
4. Freeze Must / Should / Could scope. Keep real hardware integrations, advanced prediction, and survey-grade geometry out of this demo; the current 3D view is schematic.
5. Write down that all initial readings are simulated/public-derived and thresholds are illustrative.

## Milestones

### 1. Definition and contracts

- Create 3-5 user stories for Station Leader, Logistics, and Management.
- Define success checks: a scenario completes end-to-end, data provenance is visible, queued data syncs after reconnect, and each alert gives a reason.
- Write a data dictionary and sample JSON for station, telemetry, inventory, alert, requisition, shipment, and scenario.
- Decide units, timestamps, timezone handling, and validation ranges.

**Deliverable:** agreed MVP, data dictionary, example payloads, API contract.

### 2. Data and simulator — Phase 2 scenario baseline implemented

- Build deterministic synthetic baseline data for two station profiles.
- Model linked effects: storm severity increases heating load and generator use, which increases fuel consumption and changes time-to-empty.
- Add controllable events for generator failure and shipment delay. **Implemented as synthetic, repeatable what-if overlays; see [SCENARIO_API.md](SCENARIO_API.md).**
- Keep a fixed random seed option so the demo is repeatable.
- If public weather data is used, record source, retrieval date, license/terms, and how it calibrates synthetic values.

**Deliverable:** repeatable scenario calculations and API/UI inputs with synthetic provenance. Further simulator calibration remains future work.

### 3. Ingestion and storage

- Implement one ingestion endpoint shared by simulator and future sensor adapters.
- Validate schema, units, ranges, timestamps, and provenance.
- Store local prototype telemetry and workflow records in SQLite. A server database is a later choice only if shared/deployed use is approved.
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

### 5. Operator interface — Phase 4 schematic integrated

- The existing dashboard now includes the archive-derived interactive 3D station schematic, orbit/zoom/reset controls, selectable zones, and a text-list alternative. Zone mapping and unknown-state rules are in [STATION_TWIN.md](STATION_TWIN.md).
- Add history and provenance details to each key reading.
- Add logistics workflow and role-specific management summary.
- Existing scenario controls use API overlays that do not mutate requisitions or workflow history.
- Export a compact CSV or PDF report.

**Deliverable:** complete click-through judge journey on a local build.

### 6. Hardening and demo — implemented checklist

- Exercise offline, reconnect, invalid reading metadata, and scenario reset paths with the API tests; rehearse duplicate batch/stale-data behavior as follow-up because the current sync contract does not yet deduplicate or reject stale timestamps.
- Prepare local/offline mode and use the [clean-start rehearsal checklist](DEMO_HANDOFF.md). No screenshot or recording is claimed unless the team captures one.
- Rehearse the demo from a clean start and keep it within the SIH presentation time limit.
- Verify station facts and external claims against official sources before presenting them as facts.

**Deliverable:** repeatable demo, known limitations, and fallback materials.

## Suggested six-person split

| Role | Owns |
|---|---|
| Product/demo lead | MVP, judge story, integration schedule, presentation |
| Simulator/data | synthetic generator, public-source calibration, provenance |
| API/data model | ingestion contract, validation, SQLite prototype persistence |
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
- More detailed or station-specific geometry after verified layouts and approval are available.
- Advanced forecasting after baseline assumptions can be validated.
- Additional stations, ships, or field camps after the two-station flow works.
