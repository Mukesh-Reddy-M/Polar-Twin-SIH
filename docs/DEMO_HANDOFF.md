# Clean-start demo handoff

## Start cleanly

1. Confirm Python 3.9+, Node.js 20.19+ or 22.12+, npm, and open local ports 5173/8000.
2. From the repository root, run `./scripts/run-local.sh` and wait for both services to report ready.
3. Open `http://localhost:5173`. Confirm the dashboard says **Local API mode**, shows the selected station, and labels readings synthetic.
4. If the API is unavailable, use **Seeded offline demo**. Explain that seeded data and the representative workflow are static, read-only examples.

## Rehearsal sequence

1. **Normal state:** show Maitri and Bharati selection, current conditions, schematic model and unknown/no-data areas.
2. **What-if:** run generator fault during storm or delayed shipment. Explain the changed power/heating or stock-out/ETA estimate and its illustrative assumptions.
3. **Alert and health:** show alert level, contributing inputs, promotion/recovery timer, total score, components, and synthetic provenance.
4. **Requisition to delivery:** as Station Leader create and submit a request; as Logistics review, then after management approval dispatch it and record/update ETA; as Management approve; as Station Leader confirm delivery and close. Show workflow history and the resulting shipment outlook.
5. **Exports:** export CSV and use Print / Save PDF. Verify station/scenario, generated and observed time, units, provenance, assumptions, alert/health, stock outlook, and workflow history.
6. **Seeded fallback:** switch modes, select both stations and all four seed states, and point out the read-only seeded requisition history. Confirm no fallback value is described as API-retrieved or synchronized.
7. **Telemetry buffer:** return to API mode, simulate the link outage, wait for queue growth, then reconnect and show sync confirmation. Keep this separate from seeded fallback.
8. Press **Ctrl+C** in the run terminal to stop both services.

## Known limitations and team handoff

- All station readings, stock calculations, scenario effects, alert thresholds, health scores, and seeded records are synthetic/illustrative. The 3D view is generic schematic geometry, not a surveyed layout.
- Demo role labels are not authentication. SQLite is local prototype storage; there is no deployment or live sensor connection.
- The current simulator uses fixed lookup profiles and deterministic formulas. Its `seed` value identifies a repeatability run but does not create random variation.
- For the automated checks, run `PYTHONPATH=services/api services/api/.venv/bin/python -m pytest -q services/api/tests`, `python3 services/api/scripts/check_simulator_repeatability.py`, and `npm run build` from `apps/web`.
- PDF export uses the browser print dialog. Vite currently emits a bundle-size advisory for the Three.js frontend.
- No screenshots or recording are claimed in this repository. Capture them during a rehearsal if presentation evidence is required.
- **License selection remains a team decision.** No repository license file has been added.
