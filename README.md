# Polar Twin

A bandwidth-aware digital twin and remote operations platform concept for India's Antarctic research stations, Maitri and Bharati.

**SIH 2026 · Problem Statement 26060 · Theme: Smart Automation**

> Current status: first local prototype in progress. It includes selectable simulated Maitri and Bharati profiles, station-specific storm/reset scenarios, and a small API. Prototype readings are synthetic examples and must never be presented as live station telemetry.

## Problem
Remote station teams need a shared view of infrastructure, energy, logistics, and environmental conditions, even when connectivity is slow or unavailable. Separate dashboards do not show how an environmental event can affect heating demand, fuel use, and inventory risk together.

## Proposed solution
Polar Twin models each station's operational state, connects related signals, and supports explainable alerts and supply planning. A simulator and future sensors use the same ingestion contract. An edge agent buffers and compresses data for later synchronization.

## MVP

- Station profiles for Maitri and Bharati, with a 2D station view.
- Simulated environment, energy, infrastructure, and inventory readings with clear provenance labels.
- Offline edge-agent simulation: buffer, compress, batch, and synchronize.
- Explainable Normal / Warning / Critical alerts with hysteresis and minimum-duration rules.
- Station health score with a component breakdown and reasons for changes.
- Requisition, approval, dispatch, and delivery workflow.
- Stock-out estimate compared with shipment ETA.
- At least two safe what-if scenarios, such as a generator fault during a storm and a delayed shipment.
- Role-specific views for Station Leader, Logistics, and Management.
- CSV/PDF report and an offline demo fallback.

See the [three-person first-prototype plan](docs/PROTOTYPE_PLAN.md), [build plan](docs/ROADMAP.md), and [architecture notes](docs/ARCHITECTURE.md).

## Proposed technology

- **Web:** React, Vite, TypeScript, Tailwind CSS, Recharts, Leaflet
- **API:** choose one for the MVP: Python FastAPI (recommended if the simulator is Python) or Node.js/Express
- **Simulator:** Python, NumPy, pandas
- **Storage:** PostgreSQL; add TimescaleDB only if time-series query needs justify it
- **Updates:** start with polling; add SSE/WebSocket only when the demo needs it
- **Delivery:** Docker; deploy only after the local demo is stable

The stack is a proposal, not an implementation commitment. Keep the first version small and document any decision that changes it.

## Repository layout

```text
apps/
  web/                 # station, logistics, and management interface
services/
  api/                 # ingestion and operational API
  simulator/           # correlated synthetic data and scenario events
docs/
  ARCHITECTURE.md
  ROADMAP.md
```

## Run the first prototype locally

You need Python 3 and Node.js/npm installed. Open two terminals from the repository folder.

**Terminal 1 - API and simulator**

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn polar_twin.main:app --reload --port 8000
```

**Terminal 2 - web dashboard**

```bash
cd apps/web
npm install
npm run dev
```

Open the local address printed by Vite (normally `http://localhost:5173`). Choose Maitri or Bharati, then **Start storm** to see that station’s simulated values and warning change; choose **Reset to normal** to restore that station’s baseline. The API's interactive page is at `http://localhost:8000/docs`.

The API creates a local SQLite database under `services/api/data/` the first time it runs. The database file is not intended for Git. See [the API notes](services/api/README.md) if setup fails.

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
