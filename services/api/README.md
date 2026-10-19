# Polar Twin API

Local FastAPI service for the prototype. It serves separate simulated readings for Maitri and Bharati and supports station-specific storm and reset scenarios.

```bash
cd services/api
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn polar_twin.main:app --reload --port 8000
```

The API starts at `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

Endpoints:

- `GET /api/health`
- `GET /api/stations`
- `GET /api/station/latest?station_id=maitri-demo`
- `GET /api/station/latest?station_id=bharati-demo`
- `POST /api/scenario/storm?station_id=bharati-demo`
- `POST /api/scenario/reset?station_id=bharati-demo`

The database is created at `services/api/data/prototype.sqlite3` when the service runs. Each station keeps its latest scenario separately. Bharati values are synthetic examples chosen for the demo; they are not verified station measurements, and alert thresholds are not operational guidance.
