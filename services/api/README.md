# Polar Twin API

Local FastAPI service for the first prototype. It serves a simulated station reading and supports the storm and reset scenarios.

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
- `GET /api/station/latest`
- `POST /api/scenario/storm`
- `POST /api/scenario/reset`

The database is created at `services/api/data/prototype.sqlite3` when the service runs. The readings and alert thresholds are synthetic examples, not verified station data or operational guidance.
