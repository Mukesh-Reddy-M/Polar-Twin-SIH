# Reports and offline demo mode

## CSV and PDF exports

The dashboard's **Export CSV** and **Print / Save PDF** controls export the currently displayed station and scenario. The CSV is UTF-8 with a byte-order mark, quoted spreadsheet-compatible rows, ISO 8601 UTC date/time values, and columns for section, field, value, unit, provenance, and notes/assumptions. The PDF opens a print-ready A4 report in a new browser tab; choose **Save as PDF** in the browser's print dialog.

Both formats include the station/profile, scenario, report generation and reading times, available weather/energy/power readings, alert level/reason/inputs and illustrative thresholds, overall health and component scores, stock-out-versus-shipment outlook, and selected requisition with event history when available. Missing measurements are omitted or explicitly marked unavailable. Scenario overlay ETA and the stored requisition ETA are reported separately. The report is assembled from the current dashboard state and does not call a second API snapshot.

Every reported value has a provenance column. The report calls out synthetic/seeded data, assumptions, illustrative thresholds and calculations, and the generic schematic limitation. A report is for demonstration and is not live telemetry, a surveyed station layout, a validated safety measure, or operational guidance. The PDF uses the browser's built-in print-to-PDF flow; no PDF library or external service is required.

## Seeded offline fallback

If the local API fails to load, the dashboard shows an error and the **Use seeded offline demo** button. This mode is entirely client-side and read-only for workflow data. Choose either station, then one of these fixed examples:

| Seed state | Story |
|---|---|
| Normal conditions | Baseline profile, normal illustrative alert, and shipment buffer |
| Storm | Elevated weather, increased heating demand, and warning example |
| Generator fault during storm | Constrained illustrative generation, backup load, and shorter modeled fuel horizon |
| Delayed shipment | A ten-day comparison-only delay, stock-out gap, and critical alert example |

Each state includes the schematic twin, alert and health summary, stock-out/ETA outlook, and a representative **read-only seeded** requisition timeline. These values are fixed examples with seeded provenance; they are not requested from the API and are never persisted or synchronized. Switching back to local API mode triggers a fresh API read. API workflow records and ETA history remain separate and untouched by fallback state.

The edge telemetry buffer remains a separate API-mode demonstration: use **Simulate link outage** to queue synthetic API readings in this browser, and **Reconnect & sync** to send the gzip batch to the API. Seeded fallback values are never added to that queue.

## Local run and demo evidence

From the repository root, use `./scripts/run-local.sh` as described in the [README](../README.md). Open `http://localhost:5173`; the API documentation is at `http://localhost:8000/docs`. Use the dashboard's mode panel to switch into fallback when the API is unavailable. Reports can be exported in either mode. The clean-start rehearsal sequence is in [DEMO_HANDOFF.md](DEMO_HANDOFF.md).

No screen recording is included. Use this concise recording checklist:

1. Start in API mode; show station, scenario, synthetic provenance, alert, health and the 3D schematic.
2. Run the storm or generator fault scenario; show how power/heating and the shipment outlook change.
3. Show the requisition history, then export CSV and open **Print / Save PDF**; point out units, UTC timestamps, and provenance.
4. Stop the API or use a failed API load, switch to seeded fallback, and show station switching plus the four labeled seed states and read-only request history.
5. Return to API mode and separately show the telemetry queue / reconnect sync without representing fallback data as synchronized.

No screenshots or screen recording are included. The local API and web server could not bind their development ports in this restricted run environment, so I could not capture reliable running-dashboard states. Capture these states during the team's rehearsal if presentation evidence is needed.
