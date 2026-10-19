# First prototype plan for three members

This plan aims for a small prototype the team can run on one laptop and show in a short demo. It is a starting assignment; swap tasks to match each person's experience.

## What the first prototype should do

Show one station dashboard with simulated readings. When the team triggers a storm scenario, the dashboard should show the weather worsening, heating demand and fuel use increasing, and a clear warning with the reason. Show a label saying the readings are simulated.

The first version is complete when the team can start it locally, trigger the scenario, explain what changed, and reset it for another demo.

## Keep the first version small

Build only:

- Selectable Maitri and Bharati demo profiles, each with its own normal and storm values.
- A simple web dashboard with temperature/weather, power, fuel, alert, and data-source label.
- A small Python simulator that creates repeatable sample readings.
- A simple API that gives the dashboard the latest readings and accepts a storm/reset action.
- One explainable warning rule, such as high storm severity increases heating load and fuel use.

For this prototype, use FastAPI, SQLite, and a React + Vite web app. Run everything locally. Do not start with real station data, login/roles, satellite hardware, 3D, deployment, or machine-learning forecasts.

## Who owns what

| Member | Main ownership | Also helps with |
|---|---|---|
| Mukesh | Team coordination, web dashboard, demo flow | Agree on the screen and connect it to the API |
| Tejas | FastAPI service, SQLite storage, API shape | Help run the complete app locally and document setup |
| Anish | Simulator, storm/reset scenarios, warning rule | Supply sample data and explain how readings change |

Keep the API contract shared. Tejas and Anish should agree on the reading fields before implementing separately; Mukesh should build against the same sample JSON.

## Shared reading format

Use one simple JSON format from the start:

```json
{
  "station_id": "maitri-demo",
  "observed_at": "2026-10-19T10:00:00Z",
  "provenance": "simulated",
  "weather": { "storm_severity": 0.8, "temperature_c": -25 },
  "energy": { "heating_load_kw": 42, "fuel_percent": 68 },
  "alert": { "level": "warning", "reason": "Storm severity is high; heating load and fuel use increased." }
}
```

The values above are illustrative demo values, not verified station measurements or operational thresholds. Keep units in field names or the data dictionary.

## Workflow: about two weeks

### Day 1: agree and set up together

- Mukesh writes the one-sentence demo story and creates the task list.
- Tejas creates the API project and proposes the reading format and endpoints.
- Anish creates one example simulator reading and agrees on scenario behavior with Tejas.
- All three clone/open the same repository and confirm they can run their part.

**Checkpoint:** everyone agrees on the fields and can describe the storm demo in one minute.

### Days 2–3: build parts in parallel

- Mukesh creates the dashboard layout with sample JSON shown on screen.
- Tejas creates the API with endpoints for latest reading, storm scenario, and reset.
- Anish writes the repeatable simulator: normal readings, storm readings, and reset to normal.

**Checkpoint:** dashboard renders sample data; API returns sample data; simulator produces normal and storm states.

### Days 4–6: connect the pieces

- Tejas connects the API to SQLite and makes sure scenario results can be fetched.
- Anish connects simulator output to the API and implements the first warning rule.
- Mukesh connects the dashboard to the API and shows provenance, values, and alert reason.
- Meet briefly each day to fix field-name mismatches before adding features.

**Checkpoint:** pressing “Start storm” changes the dashboard; pressing “Reset” restores normal values.

### Days 7–8: make the demo understandable

- Mukesh makes the order of the demo clear: normal state → storm → changed energy/fuel → alert explanation → reset.
- Tejas adds readable error messages and a simple way to start the API locally.
- Anish checks that scenarios are repeatable and that the rule explanation matches the displayed values.
- All three label every screen and export as simulated prototype data.

**Checkpoint:** another team member can run the demo using the setup instructions without help.

### Days 9–10: rehearse and freeze

- Run the demo from a clean restart.
- Fix only issues that block the main story; move extra ideas to a later list.
- Save screenshots and a short screen recording in case the live demo fails.
- Write down what is simulated, what is not implemented, and what would need NCPOR validation.

**Checkpoint:** a repeatable 3–5 minute demo with an offline fallback.

## Daily team rhythm

- Start: each person says the one outcome they will finish today.
- During work: share API or field changes immediately in the team chat.
- End: run the full demo path together and note blockers.
- Keep one shared task board with only three columns: To do, Doing, Done.

## First demo script

1. Open the Maitri demo dashboard and point out the `simulated` label.
2. Show normal weather, heating load, fuel, and “No active warning.”
3. Trigger the storm scenario.
4. Explain that the simulated storm raises heating load and fuel use, causing the warning.
5. Open the alert reason and show the inputs behind it.
6. Reset to normal and explain that this is a safe what-if simulation.

## Later, after this works

Add inventory and shipment ETA, offline buffering, role views, reports, and public-weather calibration one at a time. Keep both station profiles visibly synthetic until their values are validated. Only consider real sensor feeds after access, source, and data formats are confirmed.
