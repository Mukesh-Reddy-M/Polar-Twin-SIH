# Phase 4 station twin integration

The dashboard uses an interactive Three.js schematic adapted from the supplied `polartwin---antarctic-station-operations-3d-digital-twin.zip`. Only the model geometry, procedural textures, and zone highlighting / orbit interaction patterns were reused. The archive's standalone React/Tailwind dashboard, hard-coded station defaults and telemetry, scenario selector, Gemini dependencies, and AI Studio assets are not included. Reused source retains its Apache-2.0 SPDX headers.

The model is a generic schematic, not a surveyed Maitri or Bharati layout. PolarTwin's existing station and scenario controls remain authoritative. The station name, selected base/what-if scenario, alert, health components, and workflow record are supplied from the current PolarTwin dashboard/API state; changing readings updates the model's zone presentation without rebuilding the Three.js scene or resetting the camera.

## API-to-zone mapping

| Schematic zone | API fields shown | Status color mapping |
|---|---|---|
| Habitat / heating | `energy.heating_load_kw`, `energy.baseline_heating_load_kw`, `health.components.energy` | Unknown: the API has no habitat-specific operating status |
| Power / generator | `power.status`, `power.available_generation_percent`, `health.components.infrastructure`; generator scenario backup load when supplied | `steady` → normal; `constrained` → warning; missing/unrecognized → unknown |
| Fuel reserve | `energy.fuel_percent`, `inventory` stock-out/ETA/buffer/shortfall, `health.components.inventory` | `on_track` → normal; `risk` → critical; missing/unrecognized → unknown |
| Communications | No matching field is currently provided | Unknown; “No demo data available” |
| Logistics / shipment | `inventory` shipment comparison and the selected requisition's status, reference, and stored ETA when available | Uses the same explicit `inventory.status`; requisition workflow state is displayed as text and is not turned into a risk color |

The overall API alert level/reason, current scenario label, overall health score, and all four health component scores are shown in the twin summary. Each displayed value remains synthetic/demo data. Unknown zones are neutral and never receive fabricated readings.

## Interaction and fallback

- Drag to orbit; wheel or trackpad scroll and touch pinch to zoom; the on-screen controls zoom and reset the camera.
- Click/tap a modeled zone or select it from the text-list view to inspect the same API-derived details.
- The canvas remains mounted when switching between 3D and list modes, so the camera position is retained. Station/scenario/API updates change zone data and highlights only.
- Canvas sizing uses `ResizeObserver` with a window-resize fallback. Pointer-up selection ignores drags; OrbitControls handles mouse, pen, and touch gestures.
- Renderer, animation frame, resize observer, pointer handlers, controls, scene resources, and procedural texture cache are released on unmount. If WebGL initialization/context fails, the UI switches to the selectable zone list and explains the fallback.
