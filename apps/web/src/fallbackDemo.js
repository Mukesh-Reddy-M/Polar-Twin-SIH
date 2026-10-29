const PROFILES = {
  'maitri-demo': {
    station_id: 'maitri-demo', station_label: 'Maitri', station_name: 'Maitri demo station',
    normal: { storm: 18, temperature: -22, heating: 31, fuel: 70, stockout: 34, eta: 21 },
    storm: { storm: 82, temperature: -29, heating: 48, fuel: 62, stockout: 15, eta: 21 },
  },
  'bharati-demo': {
    station_id: 'bharati-demo', station_label: 'Bharati', station_name: 'Bharati demo station',
    normal: { storm: 14, temperature: -19, heating: 27, fuel: 76, stockout: 38, eta: 24 },
    storm: { storm: 77, temperature: -26, heating: 42, fuel: 68, stockout: 19, eta: 24 },
  },
};

export const FALLBACK_SCENARIOS = [
  { id: 'normal', label: 'Normal conditions' },
  { id: 'storm', label: 'Storm' },
  { id: 'generator_fault_during_storm', label: 'Generator fault during storm' },
  { id: 'delayed_shipment', label: 'Delayed shipment' },
];

const FALLBACK_REQUISITION = {
  requisition_id: 'SEEDED-REQ-001', station_id: 'maitri-demo', item_id: 'heating-fuel',
  quantity: 1000, unit: 'litres', reason: 'Seeded example for the offline demo workflow',
  status: 'dispatched', shipment_reference: 'SEEDED-SHIPMENT-001',
  eta_at: '2026-11-05T12:00:00+00:00', eta_source: 'seeded_demo',
  requested_by: { name: 'Station Leader (seeded demo)', role: 'station_leader' },
};

function dateAfter(now, days) {
  return new Date(now.getTime() + days * 86400000).toISOString();
}

function score(value) { return Math.max(0, Math.min(100, Math.round(value))); }

export function makeFallbackDemo(stationId, scenarioId, now = new Date()) {
  const station = PROFILES[stationId] ?? PROFILES['maitri-demo'];
  const isStorm = scenarioId !== 'normal';
  const profile = isStorm ? station.storm : station.normal;
  let generation = 100;
  let heating = profile.heating;
  let stockout = profile.stockout;
  let eta = profile.eta;
  let scenario = null;
  if (scenarioId === 'generator_fault_during_storm') {
    generation = 40;
    const backupLoad = Math.ceil(heating * (1 - generation / 100) * 0.25);
    const multiplier = 1 + (1 - generation / 100) * 0.5;
    heating += backupLoad;
    stockout = Math.ceil(stockout / multiplier);
    scenario = {
      id: scenarioId, title: 'Generator fault during storm', provenance: 'seeded_demo',
      inputs: { storm_severity_percent: profile.storm, generation_available_percent: generation, constrained_power_threshold_percent: 60 },
      effects: { power_status: 'constrained', backup_load_kw: backupLoad, heating_load_kw: heating, fuel_demand_multiplier: Number(multiplier.toFixed(2)), stockout_days_after_fault: stockout },
      explanation: 'Seeded offline example: reduced generation adds illustrative backup load and raises modeled fuel demand.',
    };
  } else if (scenarioId === 'delayed_shipment') {
    eta += 10;
    scenario = {
      id: scenarioId, title: 'Delayed shipment', provenance: 'seeded_demo',
      inputs: { baseline_eta_in_days: profile.eta, delay_days: 10, scenario_eta_in_days: eta },
      effects: { stockout_in_days: stockout, shortfall_days: Math.max(0, eta - stockout), arrival_buffer_days: Math.max(0, stockout - eta), outlook_status: stockout <= eta ? 'risk' : 'on_track' },
      explanation: 'Seeded offline example: shipment arrival is moved 10 days later for comparison; no API shipment record is changed.',
    };
  } else if (scenarioId === 'storm') {
    scenario = {
      id: scenarioId, title: 'Storm', provenance: 'seeded_demo',
      inputs: { storm_severity_percent: profile.storm },
      effects: { heating_load_kw: heating, fuel_percent: profile.fuel, stockout_in_days: stockout },
      explanation: 'Seeded offline example: storm conditions increase the illustrative heating demand and reduce the estimated fuel horizon.',
    };
  }
  const inventoryRisk = stockout <= eta;
  const shortfall = Math.max(0, eta - stockout);
  const buffer = Math.max(0, stockout - eta);
  const energyScore = score(100 - Math.max(0, heating / station.normal.heating - 1) * 50);
  const inventoryScore = inventoryRisk ? score(50 - shortfall * 5) : score(70 + Math.min(buffer, 10) * 3);
  const components = {
    energy: { score: energyScore, weight: 0.25, reason: `Heating load ${heating} kW versus ${station.normal.heating} kW baseline.`, provenance: 'seeded_demo' },
    infrastructure: { score: generation, weight: 0.25, reason: `${generation}% illustrative generation availability.`, provenance: 'seeded_demo' },
    inventory: { score: inventoryScore, weight: 0.25, reason: inventoryRisk ? `${shortfall}-day illustrative shipment gap.` : `${buffer}-day illustrative arrival buffer.`, provenance: 'seeded_demo' },
    environment: { score: score(100 - profile.storm), weight: 0.25, reason: `${profile.storm}% illustrative storm severity.`, provenance: 'seeded_demo' },
  };
  const healthScore = score(Object.values(components).reduce((total, item) => total + item.score * item.weight, 0));
  const critical = scenarioId === 'delayed_shipment' && shortfall >= 7;
  const warning = isStorm || generation <= 60 || inventoryRisk;
  const alertLevel = critical ? 'critical' : warning ? 'warning' : 'normal';
  const reason = critical ? `Seeded scenario shows a ${shortfall}-day shipment gap after estimated stock-out.`
    : warning ? (generation <= 60 ? 'Seeded generator availability is constrained during the storm.' : 'Seeded storm conditions increase modeled heating demand and fuel use.')
      : 'Seeded normal profile has no active demo warning.';
  const observed = now.toISOString();
  const reading = {
    station_id: station.station_id, station_label: station.station_label, station_name: station.station_name,
    observed_at: observed, provenance: 'seeded_demo', scenario: isStorm ? 'storm' : 'normal',
    weather: { storm_severity: profile.storm / 100, temperature_c: profile.temperature },
    energy: { heating_load_kw: heating, baseline_heating_load_kw: station.normal.heating, fuel_percent: profile.fuel, ...(scenarioId === 'generator_fault_during_storm' ? { storm_heating_load_kw: profile.heating, backup_load_kw: heating - profile.heating, fuel_demand_multiplier: 1.3 } : {}) },
    power: { status: generation < 60 ? 'constrained' : 'steady', available_generation_percent: generation, backup_generation_active: generation < 100, illustrative_threshold_percent: 60 },
    inventory: {
      item: 'Heating fuel', stockout_in_days: stockout, stockout_date: dateAfter(now, stockout).slice(0, 10),
      shipment_eta_in_days: eta, shipment_eta_date: dateAfter(now, eta).slice(0, 10),
      status: inventoryRisk ? 'risk' : 'on_track', shortfall_days: shortfall, arrival_buffer_days: buffer,
      calculated_at: observed, eta_source: scenarioId === 'delayed_shipment' ? 'seeded_delayed_shipment' : 'seeded_profile',
      shipment_eta_at: dateAfter(now, eta), provenance: 'seeded_demo', illustrative: true,
    },
    alert: {
      level: alertLevel, target_level: alertLevel, reason,
      contributors: alertLevel === 'normal' ? [] : [reason], inputs: {
        storm_severity_percent: profile.storm, generation_available_percent: generation, fuel_percent: profile.fuel,
        inventory_status: inventoryRisk ? 'risk' : 'on_track', shortfall_days: shortfall, arrival_buffer_days: buffer,
        scenario: scenarioId, station_id: stationId, provenance: 'seeded_demo',
      }, pending_transition: 'Seeded fallback levels are fixed examples; no live timer is running.',
      promotion_seconds_required: 10, recovery_seconds_required: 20, provenance: 'seeded_demo', illustrative: true,
    },
    health: {
      score: healthScore, weights: { energy: 0.25, infrastructure: 0.25, inventory: 0.25, environment: 0.25 },
      components, change_reason: `Seeded ${scenarioId.replaceAll('_', ' ')} state; scores are static offline examples.`,
      provenance: 'seeded_demo', illustrative: true,
    },
    assumptions: [
      'All values are seeded static synthetic examples; they were not retrieved from the API or persisted.',
      'Scenario effects, alert thresholds, health scores, stock-out estimates, and shipment timing are illustrative only.',
      'The 3D station representation is a generic schematic, not a surveyed layout or operational guidance.',
    ],
    what_if_scenario: scenario,
    fallback_scenario_id: scenarioId,
  };
  const requisition = {
    ...FALLBACK_REQUISITION, station_id: stationId,
    eta_at: reading.inventory.shipment_eta_at,
    requested_by: { ...FALLBACK_REQUISITION.requested_by },
  };
  const events = [
    ['created', 'Station Leader (seeded demo)', 'Seeded example request created.', '2026-10-28T08:00:00+00:00'],
    ['submitted', 'Station Leader (seeded demo)', 'Seeded example request submitted.', '2026-10-28T08:05:00+00:00'],
    ['review_started', 'Logistics (seeded demo)', 'Seeded logistics review started.', '2026-10-28T08:20:00+00:00'],
    ['approved', 'Management (seeded demo)', 'Seeded example request approved.', '2026-10-28T08:35:00+00:00'],
    ['dispatched', 'Logistics (seeded demo)', 'Seeded example shipment dispatched with a sample ETA.', '2026-10-28T09:00:00+00:00'],
  ].map(([action, name, notes, occurred_at], index) => ({
    event_id: index + 1, occurred_at, action, notes, provenance: 'seeded_demo',
    actor: { role: name.split(' ')[0].toLowerCase() === 'station' ? 'station_leader' : name.split(' ')[0].toLowerCase(), name },
  }));
  return { reading, requisition, events };
}
