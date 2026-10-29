# Polar Twin API

Local FastAPI service for the prototype. It serves separate simulated readings for Maitri and Bharati and supports station-specific storm and reset scenarios.

For the complete API + web app, start at the repository root with `./scripts/run-local.sh`. It creates the API virtual environment if needed, installs the API/test dependencies, installs the locked web dependencies if missing, then starts FastAPI and Vite together. Press Ctrl+C once to stop both. Prerequisites are Python 3.9+, Node.js 20.19+ or 22.12+, npm, and available ports 5173/8000.

For API-only development, install `requirements-dev.txt` (includes the API runtime requirements and pytest), then run `python -m uvicorn polar_twin.main:app --reload --port 8000` from `services/api` with that environment active.

The API starts at `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

Endpoints:

- `GET /api/health`
- `GET /api/stations`
- `GET /api/station/latest?station_id=maitri-demo`
- `GET /api/station/latest?station_id=bharati-demo`
- `POST /api/scenario/storm?station_id=bharati-demo`
- `POST /api/scenario/reset?station_id=bharati-demo`
- `POST /api/telemetry/sync` (accepts a JSON array or gzip-compressed JSON batch)
- `POST /api/scenarios/generator-fault?station_id=...`
- `POST /api/scenarios/delayed-shipment?station_id=...`
- `POST /api/scenarios/clear?station_id=...`
- `POST /api/requisitions` and `GET /api/requisitions` (create/list demo requisitions)
- `GET /api/requisitions/{id}` and `GET /api/requisitions/{id}/history`
- `POST /api/requisitions/{id}/update`, `/submit`, `/review`, `/decision`, `/dispatch`, `/eta`, `/delivery`, and `/close`

The requisition workflow is documented in [the API contract](../../docs/REQUISITION_API.md). The role switcher only supplies a demo role label; it is not authentication. Requisition and event state is stored in SQLite. A dispatched ETA is used by the existing synthetic stock-out comparison until the request is delivered.

Synthetic what-if inputs and the generator-fault and shipment-delay assumptions are described in [the scenario API notes](../../docs/SCENARIO_API.md). Active scenario parameters are stored separately by station, and scenario selection does not add or modify requisition history.

The database is created at `services/api/data/prototype.sqlite3` when the service runs. The web edge demo queues readings in browser storage while its simulated link is offline, then sends a gzip batch to the sync endpoint on reconnect. Each station keeps its latest scenario separately. Responses include an `inventory` estimate with `stockout_date`, `shipment_eta_date`, `status`, and the number of days between stock-out and shipment. Bharati values are synthetic examples chosen for the demo; they are not verified station measurements or delivery schedules, and alert thresholds are not operational guidance.

The web application also offers browser-side CSV and print-to-PDF reports, plus a read-only seeded fallback when the API cannot be reached. Neither feature adds endpoints or changes this API's workflow records. See [the report and offline demo notes](../../docs/REPORTS_OFFLINE_DEMO.md) for field contents, provenance, mode separation, and the seeded story states.

After `./scripts/run-local.sh` has created the virtual environment, run pytest from the repository root with `PYTHONPATH=services/api services/api/.venv/bin/python -m pytest -q services/api/tests`. The fixed-input repeatability check is `python3 services/api/scripts/check_simulator_repeatability.py`; current simulator profiles are deterministic lookup values, so the seed is recorded as metadata and no random variation is applied.
