# Polar Twin

A bandwidth-aware digital twin and remote operations platform concept for India's Antarctic research stations, Maitri and Bharati.

**SIH 2026 · Problem Statement 26060 · Theme: Smart Automation**

> Current status: Phases 0–5 of the local MVP are implemented. It includes selectable synthetic Maitri and Bharati profiles, storm/reset controls, generator-fault and delayed-shipment what-ifs, persisted explainable alerts with hysteresis, a component-based station health score, an API-backed SQLite requisition workflow, a shipment-versus-stockout outlook, an interactive 3D schematic with an accessible zone list, an offline edge-buffer demo, CSV/PDF reports, and a seeded offline fallback. Values are synthetic/demo inputs and must never be presented as live station telemetry.

## Problem
Remote station teams need a shared view of infrastructure, energy, logistics, and environmental conditions, even when connectivity is slow or unavailable. Separate dashboards do not show how an environmental event can affect heating demand, fuel use, and inventory risk together.

## Proposed solution
Polar Twin models each station's operational state, connects related signals, and supports explainable alerts and supply planning. A simulator and future sensors use the same ingestion contract. An edge agent buffers and compresses data for later synchronization.

## MVP

- Station profiles for Maitri and Bharati with an interactive schematic 3D station view and selectable text/list alternative.
- Simulated environment, energy, infrastructure, and inventory readings with clear provenance labels.
- Offline edge-agent simulation: buffer, compress, batch, and synchronize.
- Explainable Normal / Warning / Critical alerts with hysteresis and minimum-duration rules.
- Station health score with energy, infrastructure, inventory, and environment components and reasons for changes.
- SQLite-backed requisition, review, decision, dispatch, ETA update, delivery, close, and append-only history workflow. Demo role views are not authentication.
- Stock-out estimate compared with shipment ETA.
- Generator-fault-during-storm and delayed-shipment what-if scenarios with illustrative effect explanations.
- Role-specific views for Station Leader, Logistics, and Management.
- CSV/PDF report and an offline demo fallback.

See the [three-person first-prototype plan](docs/PROTOTYPE_PLAN.md), [build plan](docs/ROADMAP.md), [architecture notes](docs/ARCHITECTURE.md), [requisition API contract](docs/REQUISITION_API.md), [scenario API notes](docs/SCENARIO_API.md), [alert thresholds and health formula](docs/ALERTS_HEALTH.md), and [station twin integration and zone mappings](docs/STATION_TWIN.md).

Phase 5 report contents, provenance rules, fallback seed states, mode switching, and the short recording checklist are in [Reports and offline demo mode](docs/REPORTS_OFFLINE_DEMO.md).

## Implemented stack

- **Web:** React with JavaScript, Vite, CSS, and Three.js for the schematic station twin.
- **API:** Python FastAPI.
- **Simulator:** fixed synthetic Python station profiles and scenario calculations; no NumPy/pandas or random sensor generator is required.
- **Storage:** SQLite for local readings, scenario state, alert/health assessment state, requisitions, and workflow events. The browser stores the separate telemetry queue in local storage.
- **Updates:** the dashboard polls the local API; the offline telemetry demo batches and gzip-compresses browser-buffered readings before sync.
- **Run/test:** project shell script, pytest for backend coverage, and npm/Vite production build. GitHub Actions runs these checks.

There is no live station integration, authentication, deployment stack, or PostgreSQL service in the current MVP. The 3D model is a generic schematic; values and thresholds are illustrative demo content.

## Repository layout

```text
apps/
  web/                 # React/Vite dashboard and Three.js schematic
services/
  api/
    polar_twin/        # FastAPI app and deterministic simulator
    tests/             # pytest-discovered backend/API coverage
scripts/
  run-local.sh         # start API and web app together
docs/                  # API contracts, assumptions, and demo handoff
docs/
  ARCHITECTURE.md
  ROADMAP.md
```

## Run locally

Prerequisites: Python 3.9+, Node.js 20.19+ or 22.12+, npm, and network access for the first dependency install. From the repository root run:

```bash
./scripts/run-local.sh
```

The script creates `services/api/.venv` if needed, installs API and pytest dependencies, installs locked web dependencies when `node_modules` is absent, then starts both services. Open the web dashboard at `http://localhost:5173`; the API and interactive docs are at `http://localhost:8000` and `http://localhost:8000/docs`. Press **Ctrl+C** in that terminal to stop both services. Ports 5173 and 8000 must be available.

The script can be run again after setup; local API data stays in `services/api/data/prototype.sqlite3` and is not committed. It also installs pytest into the API virtual environment. Run backend tests with `PYTHONPATH=services/api services/api/.venv/bin/python -m pytest -q services/api/tests` and the fixed-input simulator check with `python3 services/api/scripts/check_simulator_repeatability.py`.

Choose Maitri or Bharati, then start a storm or run one of the two what-if scenarios. In the workflow panel, create a request as Station Leader, switch to Logistics to review and dispatch, switch to Management to decide, then switch back to confirm delivery/close. Dispatch and ETA changes feed the shipment outlook. The role selector is a demo view, not authentication. For the separate telemetry sync demo, choose **Simulate link outage**, wait for readings to queue in this browser, then choose **Reconnect & sync**. If the API cannot load, use the clearly labeled **Seeded offline demo** mode; that data is read-only and never presented as retrieved or persisted by the API.

The alert and health summary are derived from the active synthetic station profile and scenario. The dashboard refreshes every two seconds so the 10-second alert promotion and 20-second recovery timers can be observed. The station twin is a schematic 3D model with orbit/zoom, selectable zones, and a non-3D list view; zone details only use data the API provides. Exact zone mappings and the model's demo limitations are documented in [STATION_TWIN.md](docs/STATION_TWIN.md). Alert thresholds and the four equally weighted score calculations are documented in [ALERTS_HEALTH.md](docs/ALERTS_HEALTH.md); none are operational guidance. Use the dashboard's report controls to export the current state as CSV or print/save it as PDF. If the API cannot load, use **Seeded offline demo** to inspect normal, storm, generator-fault, or delayed-shipment examples; this state is read-only and never synced to the API. The existing telemetry buffer remains a separate API-mode demo.

Read the [Phase 5 report/fallback guide](docs/REPORTS_OFFLINE_DEMO.md) and the [Phase 6 clean-start rehearsal checklist](docs/DEMO_HANDOFF.md) before presenting. Remaining demo limitations and run commands are listed in [the build roadmap](docs/ROADMAP.md).

## Data integrity

Every record must include a provenance value such as `simulated`, `public-derived`, `manual`, or `sensor`. Until validated station data and authorization exist, use only simulated/public-derived values. Keep assumptions and illustrative thresholds visible in the UI and documentation.

## Team

- Team name: Ctrl_Alt_Defeat
- Team ID: 148418
- Team leader: Moola Mukesh Reddy
- Institution: C R Rao Advanced Institute of Mathematics, Statistics and Computer Science
- Team roster: see [docs/TEAM.md](docs/TEAM.md)
- Problem statement: SIH 2026 PS 26060

## License

No license has been selected. Add one after the team confirms how the project may be reused.
