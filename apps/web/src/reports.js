const UNIT_BY_KEY = {
  temperature_c: '°C', storm_severity_percent: '%', generation_available_percent: '%',
  fuel_percent: '%', heating_load_kw: 'kW', baseline_heating_load_kw: 'kW', storm_heating_load_kw: 'kW',
  backup_load_kw: 'kW', heating_load: 'kW', available_generation_percent: '%',
  stockout_in_days: 'days', stockout_days_before_fault: 'days', stockout_days_after_fault: 'days',
  stockout_days: 'days', stockout_in_days: 'days', shipment_eta_in_days: 'days', baseline_eta_in_days: 'days',
  scenario_eta_in_days: 'days', delay_days: 'days', shortfall_days: 'days', arrival_buffer_days: 'days',
  score: '/ 100', health_score: '/ 100', quantity: 'litres', promotion_seconds_required: 'seconds',
  recovery_seconds_required: 'seconds', constrained_power_threshold_percent: '%',
};

const prettyKey = (key) => key.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const isoTime = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toISOString().replace(/\.\d{3}Z$/, 'Z');
};
const valueText = (value) => value === null || value === undefined || value === '' ? 'Not available' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const formatReportValue = (name, value) => {
  if (value === null || value === undefined) return valueText(value);
  const key = name.toLowerCase();
  if (typeof value === 'string' && /date|time|eta|generated at/.test(key)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return isoTime(date);
  }
  return valueText(value);
};
const quoteCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function buildReportRows({ reading, stationId, scenarioLabel, generatedAt, requisition, events = [], mode }) {
  const rows = [];
  const add = (section, name, value, unit = '', provenance = reading?.provenance ?? 'simulated', note = '') => {
    rows.push({ section, name, value: formatReportValue(name, value), unit, provenance, note });
  };
  const stamp = isoTime(generatedAt);
  const profile = reading?.assumptions?.join(' ') ?? 'Synthetic illustrative demo inputs; not operational guidance.';
  add('Report', 'Generated at', stamp, 'UTC', mode === 'fallback' ? 'seeded_demo' : 'dashboard_export', profile);
  add('Report', 'Data mode', mode === 'fallback' ? 'Seeded offline fallback' : 'Local API', '', mode === 'fallback' ? 'seeded_demo' : 'simulated', 'No claim of live station data.');
  add('Station', 'Station ID', stationId);
  add('Station', 'Station name', reading?.station_name);
  add('Station', 'Reading observed at', reading?.observed_at, 'UTC', reading?.provenance);
  add('Scenario', 'Active scenario', scenarioLabel, '', reading?.what_if_scenario?.provenance ?? reading?.provenance, reading?.what_if_scenario?.explanation ?? 'Current base profile; no what-if overlay.');

  const metrics = [
    ['weather', 'storm_severity', '%', (v) => typeof v === 'number' ? Math.round(v * 100) : v],
    ['weather', 'temperature_c', '°C'],
    ['energy', 'heating_load_kw', 'kW'], ['energy', 'baseline_heating_load_kw', 'kW'],
    ['energy', 'storm_heating_load_kw', 'kW'], ['energy', 'backup_load_kw', 'kW'],
    ['energy', 'fuel_percent', '%'], ['energy', 'fuel_demand_multiplier', '×'],
    ['power', 'status', ''], ['power', 'available_generation_percent', '%'],
  ];
  metrics.forEach(([group, key, unit, convert]) => {
    if (reading?.[group]?.[key] !== undefined) add('Current readings', prettyKey(key), convert ? convert(reading[group][key]) : reading[group][key], unit, reading.provenance);
  });

  const alert = reading?.alert;
  add('Alert', 'Level', alert?.level, '', alert?.provenance ?? reading?.provenance, alert?.illustrative ? 'Illustrative threshold result.' : '');
  add('Alert', 'Explanation', alert?.reason, '', alert?.provenance ?? reading?.provenance, '');
  add('Alert', 'Pending transition', alert?.pending_transition, '', alert?.provenance ?? reading?.provenance, '');
  if (alert?.thresholds) add('Alert rules', 'Illustrative thresholds and durations', alert.thresholds, '', alert?.provenance ?? reading?.provenance, 'Demo rules only; not validated operational thresholds.');
  Object.entries(alert?.inputs ?? {}).forEach(([key, value]) => add('Alert inputs', prettyKey(key), value, UNIT_BY_KEY[key] ?? '', alert?.provenance ?? reading?.provenance, 'Synthetic input; threshold rules are illustrative.'));

  const health = reading?.health;
  add('Health', 'Overall score', health?.score, '/ 100', health?.provenance ?? reading?.provenance, health?.change_reason ?? 'Illustrative demo score.');
  if (health?.formula) add('Health', 'Score formula', health.formula, '', health?.provenance ?? reading?.provenance, 'Illustrative demo calculation.');
  Object.entries(health?.components ?? {}).forEach(([key, component]) => {
    add('Health components', prettyKey(key), component.score, '/ 100', component.provenance ?? health?.provenance ?? reading?.provenance, `${component.reason ?? ''}; weight ${component.weight ?? health?.weights?.[key] ?? 'not stated'}`);
  });

  const inventory = reading?.inventory;
  [
    ['stockout_in_days', 'days'], ['stockout_date', 'UTC date'], ['shipment_eta_in_days', 'days'],
    ['shipment_eta_date', 'UTC date'], ['status', ''], ['shortfall_days', 'days'], ['arrival_buffer_days', 'days'],
    ['eta_source', ''], ['shipment_eta_at', 'UTC'],
  ].forEach(([key, unit]) => {
    if (inventory?.[key] !== undefined) add('Shipment outlook', prettyKey(key), inventory[key], unit, inventory.provenance ?? reading.provenance, 'Stock-out and arrival comparison is illustrative.');
  });

  const scenario = reading?.what_if_scenario;
  Object.entries(scenario?.inputs ?? {}).forEach(([key, value]) => add('Scenario inputs', prettyKey(key), value, UNIT_BY_KEY[key] ?? '', scenario.provenance ?? reading.provenance, 'Illustrative scenario parameter.'));
  Object.entries(scenario?.effects ?? {}).forEach(([key, value]) => add('Scenario effects', prettyKey(key), value, UNIT_BY_KEY[key] ?? '', scenario.provenance ?? reading.provenance, scenario.explanation ?? 'Illustrative effect.'));

  if (requisition) {
    add('Requisition', 'ID', requisition.requisition_id, '', requisition.provenance ?? (mode === 'fallback' ? 'seeded_demo' : 'manual_demo_action'));
    add('Requisition', 'State', requisition.status, '', requisition.provenance ?? (mode === 'fallback' ? 'seeded_demo' : 'manual_demo_action'));
    add('Requisition', 'Item', requisition.item_id, '', requisition.provenance ?? 'manual_demo_entry');
    add('Requisition', 'Quantity', requisition.quantity, requisition.unit ?? '', requisition.provenance ?? 'manual_demo_entry');
    add('Requisition', 'Reason', requisition.reason, '', requisition.provenance ?? 'manual_demo_entry');
    add('Requisition', 'Shipment reference', requisition.shipment_reference, '', requisition.provenance ?? 'manual_demo_action');
    add('Requisition', 'Recorded ETA', requisition.eta_at, 'UTC', requisition.provenance ?? 'manual_demo_action', 'Stored workflow ETA. Scenario ETA overlays are reported separately.');
    events.forEach((event, index) => {
      const prefix = `Event ${String(index + 1).padStart(2, '0')}`;
      const provenance = event.provenance ?? (mode === 'fallback' ? 'seeded_demo' : 'manual_demo_action');
      add('Workflow history', `${prefix} action`, event.action, '', provenance);
      add('Workflow history', `${prefix} time`, event.occurred_at, 'UTC', provenance);
      add('Workflow history', `${prefix} actor`, event.actor?.name ?? event.actor?.role, '', provenance);
      add('Workflow history', `${prefix} notes`, event.notes, '', provenance);
    });
  } else {
    add('Requisition', 'Availability', 'No requisition available for this station', '', 'not_available', 'No workflow record is included.');
  }
  (reading?.assumptions ?? []).forEach((assumption, index) => add('Assumptions', `Assumption ${index + 1}`, assumption, '', reading?.provenance ?? 'simulated'));
  add('Provenance', 'Station model', 'Generic schematic; not a surveyed layout', '', 'schematic_demo');
  add('Provenance', 'Operational status', 'Not live data; not validated operational guidance', '', 'synthetic_demo');
  return rows;
}

export function downloadCsv(rows, filename) {
  const headings = ['Section', 'Field', 'Value', 'Unit', 'Provenance', 'Notes / assumptions'];
  const csv = `\uFEFF${[headings, ...rows.map((row) => [row.section, row.name, row.value, row.unit, row.provenance, row.note])]
    .map((line) => line.map(quoteCsv).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openPdfReport(rows, title) {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('The report window was blocked. Allow pop-ups, then try PDF again.');
  const bodyRows = rows.map((row) => `<tr><td>${escapeHtml(row.section)}</td><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.value)}</td><td>${escapeHtml(row.unit)}</td><td>${escapeHtml(row.provenance)}</td><td>${escapeHtml(row.note)}</td></tr>`).join('');
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:10px/1.45 Arial,sans-serif;color:#172638;margin:0}h1{font-size:21px;margin:0 0 5px}h2{font-size:13px;margin:14px 0 6px}p{margin:5px 0}.banner{padding:9px 11px;border:2px solid #d97706;background:#fff7ed;color:#7c2d12;font-weight:bold;margin:12px 0}.meta{color:#52677a}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #cbd5e1;padding:5px;vertical-align:top;overflow-wrap:anywhere}th{background:#eaf0f5;text-align:left}td:nth-child(1){width:13%}td:nth-child(2){width:19%}td:nth-child(3){width:20%}td:nth-child(4){width:8%}td:nth-child(5){width:15%}td:nth-child(6){width:25%}.foot{margin-top:12px;color:#52677a}@media print{tr{break-inside:avoid}}
    </style></head><body><h1>${escapeHtml(title)}</h1><p class="meta">Generated ${escapeHtml(rows.find((r) => r.name === 'Generated at')?.value ?? isoTime())} · All values are synthetic / seeded demo data.</p><div class="banner">DEMO REPORT — NOT LIVE STATION DATA, A SURVEYED STATION LAYOUT, VALIDATED SAFETY MEASURES, OR OPERATIONAL GUIDANCE.</div><table><thead><tr><th>Section</th><th>Field</th><th>Value</th><th>Unit</th><th>Provenance</th><th>Notes / assumptions</th></tr></thead><tbody>${bodyRows}</tbody></table><p class="foot">Save or print this page as PDF using the browser print dialog. Missing data is left unavailable; no missing measurements have been filled in.</p><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></body></html>`);
  popup.document.close();
}

export function reportFilename(stationId, scenario, extension) {
  const slug = String(scenario || 'demo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `polar-twin-${stationId}-${slug}-${new Date().toISOString().replaceAll(':', '').replaceAll('-', '').replace(/\.\d{3}Z$/, 'Z')}.${extension}`;
}
