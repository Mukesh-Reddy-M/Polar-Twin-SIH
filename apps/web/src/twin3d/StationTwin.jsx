/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * PolarTwin adapter for the Apache-2.0 station geometry from the supplied archive.
 * API values and operational state are passed in by the existing dashboard.
 */
import { useCallback, useMemo, useState } from 'react';
import StationCanvas from './StationCanvas.jsx';

const ZONE_LABELS = {
  habitat: 'Habitat / heating',
  power: 'Power / generator',
  fuel: 'Fuel reserve',
  communications: 'Communications',
  logistics: 'Logistics / shipment',
};

function makeZones(reading, requisition) {
  const health = reading?.health?.components ?? {};
  const energy = reading?.energy;
  const power = reading?.power;
  const inventory = reading?.inventory;
  const scenario = reading?.what_if_scenario;
  const scenarioEffects = scenario?.effects ?? {};
  const etaOrigin = inventory?.eta_source === 'dispatched_requisition'
    ? 'Active dispatched requisition'
    : inventory?.eta_source === 'delayed_shipment_scenario'
      ? 'Delayed-shipment what-if comparison'
      : 'Synthetic station profile';

  const hasValue = (value) => value !== undefined && value !== null && value !== '';
  const entries = [
    {
      id: 'habitat', label: ZONE_LABELS.habitat, status: 'unknown',
      detail: hasValue(energy?.heating_load_kw)
        ? 'Heating demand is available; this API has no habitat condition/status reading.'
        : 'No demo data available for habitat condition.',
      component: health.energy,
      metrics: hasValue(energy?.heating_load_kw) ? [
        [`Heating load`, `${energy.heating_load_kw} kW`],
        ['Profile baseline', `${energy.baseline_heating_load_kw} kW`],
      ] : [],
    },
    {
      id: 'power', label: ZONE_LABELS.power,
      status: power?.status === 'constrained' ? 'warning' : power?.status === 'steady' ? 'normal' : 'unknown',
      detail: hasValue(power?.status) ? `API power status: ${power.status}.` : 'No demo data available for power status.',
      component: health.infrastructure,
      metrics: [
        ...(hasValue(power?.available_generation_percent) ? [['Available generation', `${power.available_generation_percent}%`]] : []),
        ...(hasValue(power?.status) ? [['API status', power.status]] : []),
        ...(hasValue(scenarioEffects.backup_load_kw) ? [['Scenario backup load', `${scenarioEffects.backup_load_kw} kW`]] : []),
      ],
    },
    {
      id: 'fuel', label: ZONE_LABELS.fuel,
      status: inventory?.status === 'risk' ? 'critical' : inventory?.status === 'on_track' ? 'normal' : 'unknown',
      detail: hasValue(inventory?.status) ? `Stock-out comparison: ${inventory.status}.` : 'No demo data available for fuel outlook.',
      component: health.inventory,
      metrics: [
        ...(hasValue(energy?.fuel_percent) ? [['Fuel remaining', `${energy.fuel_percent}%`]] : []),
        ...(hasValue(inventory?.stockout_in_days) ? [['Estimated stock-out', `in ${inventory.stockout_in_days} days`]] : []),
        ...(hasValue(inventory?.shipment_eta_in_days) ? [['Shipment ETA', `in ${inventory.shipment_eta_in_days} days`]] : []),
        ...(inventory?.status === 'risk' ? [['Shortfall', `${inventory.shortfall_days} days`]] : hasValue(inventory?.arrival_buffer_days) ? [['Arrival buffer', `${inventory.arrival_buffer_days} days`]] : []),
      ],
    },
    {
      id: 'communications', label: ZONE_LABELS.communications, status: 'unknown',
      detail: 'No demo data available for communications status, bandwidth, or latency.',
      component: null, metrics: [],
    },
    {
      id: 'logistics', label: ZONE_LABELS.logistics,
      status: inventory?.status === 'risk' ? 'critical' : inventory?.status === 'on_track' ? 'normal' : 'unknown',
      detail: requisition
        ? `Requisition ${requisition.requisition_id} is ${requisition.status.replaceAll('_', ' ')}.`
        : 'No demo requisition is selected; shipment comparison uses the synthetic profile or scenario.',
      component: health.inventory,
      metrics: [
        ...(requisition ? [['Requisition state', requisition.status.replaceAll('_', ' ')]] : []),
        ...(requisition?.shipment_reference ? [['Shipment reference', requisition.shipment_reference]] : []),
        ...(requisition?.eta_at ? [['Recorded requisition ETA', new Date(requisition.eta_at).toLocaleString()]] : []),
        ...(hasValue(inventory?.shipment_eta_in_days) ? [['Comparison ETA', `in ${inventory.shipment_eta_in_days} days · ${etaOrigin}`]] : []),
        ...(hasValue(scenarioEffects.delay_days) ? [['What-if delay', `${scenarioEffects.delay_days} days added to comparison only`]] : []),
      ],
    },
  ];
  return entries.map((zone) => ({
    ...zone,
    statusLabel: zone.status === 'unknown' ? 'No demo data available' : zone.status,
  }));
}

export default function StationTwin({ reading, requisition }) {
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [viewMode, setViewMode] = useState('3d');
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const zones = useMemo(() => makeZones(reading, requisition), [reading, requisition]);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const onWebglError = useCallback(() => {
    setWebglUnavailable(true);
    setViewMode('list');
  }, []);
  const scenarioLabel = reading?.what_if_scenario?.title
    ?? (reading?.scenario === 'storm' ? 'Storm profile' : reading ? 'Normal profile' : 'Waiting for API reading');
  const alert = reading?.alert;
  const health = reading?.health;

  return (
    <div className="station-twin" aria-label="Schematic synthetic station twin">
      <div className="station-twin-summary">
        <div className="station-twin-context">
          <span>{reading?.station_name ?? 'Station profile'} · schematic model</span>
          <strong>{scenarioLabel}</strong>
        </div>
        <div className={`station-twin-alert alert-state-${alert?.level ?? 'unknown'}`}>
          <span>API ALERT</span><strong>{alert?.level?.toUpperCase() ?? 'UNKNOWN'}</strong>
        </div>
        <div className="station-twin-health">
          <span>HEALTH · {health?.score ?? '—'}/100</span>
          {Object.entries(health?.components ?? {}).map(([name, component]) => (
            <span key={name} title={component.reason}>{name} {component.score}</span>
          ))}
        </div>
      </div>
      {alert?.reason && <p className="station-twin-alert-reason">{alert.reason}{alert.pending_transition ? ` ${alert.pending_transition}` : ''}</p>}
      {scenarioLabel && reading && <p className="station-twin-provenance">API-derived synthetic demo state · {scenarioLabel} · schematic geometry, not a surveyed station layout</p>}

      <div className="station-twin-view-tabs" role="tablist" aria-label="Station twin view">
        <button type="button" role="tab" aria-selected={viewMode === '3d'} onClick={() => !webglUnavailable && setViewMode('3d')} disabled={webglUnavailable}>3D model</button>
        <button type="button" role="tab" aria-selected={viewMode === 'list'} onClick={() => setViewMode('list')}>Selectable zone list</button>
      </div>

      <div className={`station-twin-canvas-pane ${viewMode === '3d' ? 'is-visible' : 'is-hidden'}`} aria-hidden={viewMode !== '3d'}>
        <StationCanvas zones={zones} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} onWebglError={onWebglError} />
      </div>
      {webglUnavailable && <p className="station-twin-fallback-note" role="status">3D could not start in this browser. The selectable text list remains available.</p>}

      {viewMode === 'list' && <div className="station-zone-list" role="tabpanel" aria-label="Station zones">
        {zones.map((zone) => (
          <button type="button" key={zone.id} className={`station-zone-row zone-${zone.status} ${selectedZoneId === zone.id ? 'is-selected' : ''}`} onClick={() => setSelectedZoneId(zone.id)} aria-pressed={selectedZoneId === zone.id}>
            <span className="station-zone-dot" /><span className="station-zone-row-copy"><strong>{zone.label}</strong><small>{zone.statusLabel}</small></span>
            <span className="station-zone-summary">{zone.metrics[0]?.[1] ?? 'No demo data available'}</span>
          </button>
        ))}
      </div>}

      {selectedZone && <section className="station-zone-detail" aria-live="polite">
        <div className="station-zone-detail-head"><div><span>SELECTED ZONE</span><h5>{selectedZone.label}</h5></div><button type="button" onClick={() => setSelectedZoneId(null)} aria-label="Clear selected zone">Clear</button></div>
        <div className={`station-zone-status zone-${selectedZone.status}`}>{selectedZone.statusLabel}</div>
        <p>{selectedZone.detail}</p>
        {selectedZone.component && <p className="station-zone-component">Health component score: {selectedZone.component.score}/100 · {selectedZone.component.reason}</p>}
        {selectedZone.metrics.length > 0 ? <dl>{selectedZone.metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : <p className="station-zone-no-data">No demo data available.</p>}
      </section>}
      <p className="station-twin-disclaimer">All displayed values are synthetic demo inputs. Zone status colors appear only where the API supplies a matching power or stock-out state; other zones remain unknown.</p>
    </div>
  );
}
