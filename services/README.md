# Services

Implemented service layout:

- `api/`: FastAPI ingestion and operational API, with the synthetic profiles/scenario simulator in `api/polar_twin/simulator.py`.
- SQLite stores the local prototype records under `api/data/`; the simulator and API share Python reading structures.

Keep provenance attached from generation through display and export. Start both services from the repository root with `./scripts/run-local.sh`; see [the root README](../README.md) and [demo handoff checklist](../docs/DEMO_HANDOFF.md).
