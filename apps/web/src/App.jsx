import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadQueuedReadings, prepareBatch, saveQueuedReadings } from './edgeQueue.js';
import StationTwin from './twin3d/StationTwin.jsx';
import { FALLBACK_SCENARIOS, makeFallbackDemo } from './fallbackDemo.js';
import { buildReportRows, downloadCsv, openPdfReport, reportFilename } from './reports.js';
import Icon from './Icon.jsx';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatTime(value) {
  if (!value) return 'Waiting for first reading';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(value));
}

function toDateTimeInput(value) {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function formatScenarioValue(key, value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const unit = key.includes('percent') ? '%' : key.includes('days') ? ' days' : key.endsWith('_kw') ? ' kW' : key.includes('multiplier') ? '×' : '';
  return `${value}${unit}`;
}

export default function App() {
  const [reading, setReading] = useState(null);
  const [dataMode, setDataMode] = useState('api');
  const [fallbackScenario, setFallbackScenario] = useState('normal');
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('maitri-demo');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reportError, setReportError] = useState('');
  const [edgeLinkOnline, setEdgeLinkOnline] = useState(true);
  const [queuedReadings, setQueuedReadings] = useState(loadQueuedReadings);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('Demo link is online. Readings come from the local prototype API.');
  const [lastSync, setLastSync] = useState(null);
  const [role, setRole] = useState('Station Leader');
  const [requisitions, setRequisitions] = useState([]);
  const [selectedRequisitionId, setSelectedRequisitionId] = useState('');
  const [workflowEvents, setWorkflowEvents] = useState([]);
  const [requestQuantity, setRequestQuantity] = useState('1000');
  const [requestReason, setRequestReason] = useState('Synthetic storm-response demo request');
  const [workflowNotes, setWorkflowNotes] = useState('');
  const [shipmentReference, setShipmentReference] = useState('DEMO-SHIPMENT-001');
  const [etaInput, setEtaInput] = useState(() => toDateTimeInput(Date.now() + 7 * 86400000));
  const [receivedQuantity, setReceivedQuantity] = useState('1000');

  const roleKeys = { 'Station Leader': 'station_leader', Logistics: 'logistics', Management: 'management' };
  const actorNames = { 'Station Leader': 'Station Leader (demo)', Logistics: 'Logistics (demo)', Management: 'Management (demo)' };
  const actor = { role: roleKeys[role], name: actorNames[role] };
  const fallbackDemo = useMemo(() => makeFallbackDemo(stationId, fallbackScenario), [stationId, fallbackScenario]);

  const refreshWorkflow = useCallback(async () => {
    if (dataMode !== 'api') return;
    try {
      const response = await fetch(`/api/requisitions?station_id=${encodeURIComponent(stationId)}`);
      if (!response.ok) throw new Error('Could not load requisitions.');
      const items = await response.json();
      setRequisitions(items);
      setSelectedRequisitionId((current) => items.some((item) => item.requisition_id === current)
        ? current : (items[0]?.requisition_id ?? ''));
    } catch {
      setError('Could not load the requisition workflow from the local API.');
    }
  }, [stationId, dataMode]);

  const selectedRequisition = dataMode === 'fallback'
    ? fallbackDemo.requisition
    : requisitions.find((item) => item.requisition_id === selectedRequisitionId) ?? null;
  const displayedRequisitions = dataMode === 'fallback' ? [fallbackDemo.requisition] : requisitions;
  const displayedEvents = dataMode === 'fallback' ? fallbackDemo.events : workflowEvents;

  useEffect(() => { if (dataMode === 'api') refreshWorkflow(); }, [dataMode, refreshWorkflow]);

  useEffect(() => {
    if (dataMode === 'fallback') {
      return;
    }
    const item = requisitions.find((entry) => entry.requisition_id === selectedRequisitionId);
    if (item) {
      setRequestQuantity(String(item.quantity));
      setRequestReason(item.reason);
    }
  }, [selectedRequisitionId]);

  useEffect(() => {
    if (dataMode === 'fallback') {
      setWorkflowEvents([]);
      return;
    }
    if (!selectedRequisitionId) {
      setWorkflowEvents([]);
      return;
    }
    fetch(`/api/requisitions/${encodeURIComponent(selectedRequisitionId)}/history`)
      .then((response) => response.ok ? response.json() : [])
      .then(setWorkflowEvents)
      .catch(() => setWorkflowEvents([]));
  }, [selectedRequisitionId, requisitions, dataMode]);

  async function workflowRequest(path, body) {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Workflow action failed.');
      if (result.requisition_id) setSelectedRequisitionId(result.requisition_id);
      await refreshWorkflow();
      await refresh();
      setError('');
      setWorkflowNotes('');
    } catch (requestError) {
      setError(requestError.message || 'Workflow action failed.');
    } finally {
      setBusy(false);
    }
  }

  function actionBody(extra = {}) {
    return { actor, notes: workflowNotes, ...extra };
  }

  const refresh = useCallback(async () => {
    if (dataMode !== 'api') return;
    try {
      const response = await fetch(`/api/station/latest?station_id=${encodeURIComponent(stationId)}`);
      if (!response.ok) throw new Error('The station API returned an error.');
      setReading(await response.json());
      setError('');
    } catch {
      setError('Cannot reach the local API. Start the API service, then refresh.');
    } finally {
      setLoading(false);
    }
  }, [stationId, dataMode]);

  useEffect(() => {
    fetch('/api/stations')
      .then((response) => {
        if (!response.ok) throw new Error('The station list could not be loaded.');
        return response.json();
      })
      .then(setStations)
      .catch(() => setError('Cannot load station choices. Check that the local API is running.'));
  }, []);

  useEffect(() => {
    if (dataMode !== 'api') return undefined;
    setLoading(true);
    refresh();
  }, [dataMode, refresh]);

  useEffect(() => {
    if (!edgeLinkOnline || dataMode !== 'api') return undefined;
    const interval = window.setInterval(refresh, 2000);
    return () => window.clearInterval(interval);
  }, [dataMode, edgeLinkOnline, refresh]);

  async function chooseScenario(scenario) {
    if (dataMode === 'fallback') {
      setFallbackScenario(scenario === 'storm' ? 'storm' : 'normal');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/scenario/${scenario}?station_id=${encodeURIComponent(stationId)}`, { method: 'POST' });
      if (!response.ok) throw new Error('Scenario could not be started.');
      setReading(await response.json());
      setError('');
    } catch {
      setError('Could not update the scenario. Check that the local API is running.');
    } finally {
      setBusy(false);
    }
  }

  async function runWhatIf(scenarioId) {
    if (dataMode === 'fallback') {
      setFallbackScenario(scenarioId);
      return;
    }
    setBusy(true);
    try {
      const endpoint = scenarioId === 'generator_fault_during_storm'
        ? '/api/scenarios/generator-fault'
        : '/api/scenarios/delayed-shipment';
      const payload = scenarioId === 'generator_fault_during_storm'
        ? { generation_available_percent: 40 }
        : { delay_days: 10 };
      const response = await fetch(`${endpoint}?station_id=${encodeURIComponent(stationId)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not run this demo scenario.');
      setReading(result);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not run this demo scenario.');
    } finally {
      setBusy(false);
    }
  }

  async function clearWhatIf() {
    if (dataMode === 'fallback') {
      setFallbackScenario(isStorm ? 'storm' : 'normal');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/scenarios/clear?station_id=${encodeURIComponent(stationId)}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Could not clear this demo scenario.');
      setReading(result);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Could not clear this demo scenario.');
    } finally {
      setBusy(false);
    }
  }

  const activeReading = dataMode === 'fallback' ? fallbackDemo.reading : reading?.station_id === stationId ? reading : null;
  const activeWorkflowEvents = dataMode === 'fallback' ? fallbackDemo.events : workflowEvents;
  const isStorm = activeReading?.scenario === 'storm';
  const scenarioStyle = isStorm ? 'katabatic' : 'normal';
  const alertLevel = activeReading?.alert?.level ?? 'normal';
  const inventory = activeReading?.inventory;
  const whatIfScenario = activeReading?.what_if_scenario;
  const inventoryAtRisk = inventory?.status === 'risk';
  const queuedBytes = new TextEncoder().encode(JSON.stringify(queuedReadings)).byteLength;

  useEffect(() => {
    if (edgeLinkOnline || !activeReading || dataMode !== 'api') return undefined;
    const interval = window.setInterval(() => {
      const pending = loadQueuedReadings();
      if (pending.length >= 500) {
        setSyncFeedback('The local buffer is full. Reconnect to sync it before collecting more.');
        return;
      }
      const sample = {
        ...activeReading,
        observed_at: new Date().toISOString(),
        edge_sequence: `${stationId}-${Date.now()}`,
      };
      const nextQueue = [...pending, sample];
      saveQueuedReadings(nextQueue);
      setQueuedReadings(nextQueue);
      setSyncFeedback('Demo link is offline. Synthetic readings are queued in this browser.');
    }, 3000);
    return () => window.clearInterval(interval);
  }, [activeReading, dataMode, edgeLinkOnline, stationId]);

  async function reconnectAndSync() {
    if (dataMode !== 'api') {
      setSyncFeedback('Telemetry buffer and reconnect demo remain available in API mode only. Seeded fallback data is not queued or synced.');
      return;
    }
    const pending = loadQueuedReadings();
    setEdgeLinkOnline(true);
    if (pending.length === 0) {
      setSyncFeedback('Demo link is online. There are no readings waiting to sync.');
      return;
    }
    setSyncing(true);
    setSyncFeedback('Compressing and syncing the queued batch…');
    try {
      const batch = await prepareBatch(pending);
      const headers = { 'Content-Type': 'application/json' };
      if (batch.compressed) headers['Content-Encoding'] = 'gzip';
      const response = await fetch('/api/telemetry/sync', { method: 'POST', headers, body: batch.body });
      if (!response.ok) throw new Error('Sync request failed.');
      const result = await response.json();
      saveQueuedReadings([]);
      setQueuedReadings([]);
      setLastSync({
        accepted: result.accepted_readings,
        sent: result.transmitted_bytes,
        raw: result.uncompressed_bytes,
        compression: result.compression,
      });
      setSyncFeedback(`${result.accepted_readings} synthetic readings synced successfully.`);
    } catch {
      setEdgeLinkOnline(false);
      setSyncFeedback('Sync failed. Readings remain saved on this device; try reconnecting again.');
    } finally {
      setSyncing(false);
    }
  }

  function selectFallbackMode() {
    setDataMode('fallback');
    setError('');
    setLoading(false);
    setFallbackScenario('normal');
  }

  function returnToApiMode() {
    setDataMode('api');
    setError('');
    setLoading(true);
  }

  function exportReport(format) {
    try {
      setReportError('');
      const scenarioLabel = dataMode === 'fallback'
        ? FALLBACK_SCENARIOS.find((item) => item.id === fallbackScenario)?.label ?? fallbackScenario
        : activeReading?.what_if_scenario?.title ?? (activeReading?.scenario === 'storm' ? 'Storm' : 'Normal conditions');
      const rows = buildReportRows({
        reading: activeReading, stationId, scenarioLabel, generatedAt: new Date(),
        requisition: selectedRequisition, events: activeWorkflowEvents, mode: dataMode,
      });
      if (format === 'csv') downloadCsv(rows, reportFilename(stationId, scenarioLabel, 'csv'));
      else openPdfReport(rows, `Polar Twin demo report — ${activeReading?.station_name ?? stationId} — ${scenarioLabel}`);
    } catch (exportError) {
      setReportError(exportError?.message || 'Could not create the report. Please try again.');
    }
  }

  return (
    <div className={`polar-app scenario-${scenarioStyle}`}>
      <div className="ambient-snow-layer" aria-hidden="true">
        <span className="snow-dot snow-dot-one" />
        <span className="snow-dot snow-dot-two" />
        <span className="snow-dot snow-dot-three" />
        <span className="wind-stream wind-stream-one" />
        <span className="wind-stream wind-stream-two" />
      </div>

      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand-group" href="#top" aria-label="Polar Twin home">
            <div className="brand-emblem"><span className="emblem-ring" /><span className="emblem-letter">P</span></div>
            <div>
              <div className="brand-title">POLAR <span>TWIN</span></div>
              <div className="brand-subtitle">ANTARCTIC STATION DEMO DASHBOARD</div>
            </div>
          </a>
          <div className="topbar-actions">
            <div className={`telemetry-pill ${dataMode === 'fallback' ? 'amber' : 'emerald'}`}><span className="status-dot" />{dataMode === 'fallback' ? 'SEEDED FALLBACK MODE' : 'LOCAL API MODE'}</div>
            <div className={`telemetry-pill ${edgeLinkOnline ? 'emerald' : 'amber'}`}>
              <span className="status-dot" />
              {dataMode === 'fallback' ? 'API LINK NOT IN USE' : edgeLinkOnline ? 'DEMO LINK ONLINE' : `LOCAL BUFFERING (${queuedReadings.length})`}
            </div>
            <div className="prototype-badge">SYNTHETIC PROTOTYPE</div>
          </div>
        </div>
      </header>

      <main className="dashboard-container" id="top">
        <section className="page-intro">
          <div>
            <p className="eyebrow">STATION OPERATIONS / DEMO ENVIRONMENT</p>
            <h1 className="page-headline">Station overview</h1>
            <p className="page-tagline">Explore how simulated weather conditions affect station energy and supply.</p>
          </div>
          <div className="reading-box">
            <span className="reading-label">LAST API READING</span>
            <span className="reading-time">{loading ? 'Loading…' : formatTime(activeReading?.observed_at)}</span>
            <span className="reading-coords">{activeReading?.station_label ?? 'Station profile'} · synthetic data</span>
          </div>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}
        <section className={`data-mode-panel ${dataMode === 'fallback' ? 'is-fallback' : ''}`} aria-label="Demo data mode">
          <div><strong>{dataMode === 'fallback' ? 'Seeded offline demo is active' : 'Local API mode is active'}</strong><p>{dataMode === 'fallback' ? 'These named seed states work without the API. They are static examples, were not retrieved live, and are not saved to API workflow or shipment records.' : 'If the API cannot be reached, switch to the seeded demo. The API workflow and the seeded read-only workflow stay separate.'}</p></div>
          {dataMode === 'fallback'
            ? <button type="button" className="btn-polar btn-secondary" onClick={returnToApiMode}>Try local API again</button>
            : <button type="button" className="btn-polar btn-secondary" onClick={selectFallbackMode}>Use seeded offline demo</button>}
        </section>

        <section className="antarctic-hero-card" aria-label="Selected Antarctic station">
          <svg className="hero-scene-svg" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#030814" /><stop offset="60%" stopColor="#071830" /><stop offset="100%" stopColor="#122d4d" /></linearGradient>
              <linearGradient id="auroraGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#10b981" stopOpacity="0" /><stop offset="0.45" stopColor="#2dd4bf" stopOpacity="0.42" /><stop offset="0.8" stopColor="#38bdf8" stopOpacity="0.25" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
              <linearGradient id="auroraGrad2" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stopColor="#818cf8" stopOpacity="0" /><stop offset="0.4" stopColor="#6366f1" stopOpacity="0.28" /><stop offset="0.75" stopColor="#38bdf8" stopOpacity="0.3" /><stop offset="1" stopColor="#2dd4bf" stopOpacity="0" /></linearGradient>
            </defs>
            <rect width="1200" height="360" fill="url(#skyGrad)" />
            {/* Ambient Antarctic Starfield */}
            <g fill="#e0f2fe" opacity="0.6">
              <circle cx="95" cy="42" r="1.2" />
              <circle cx="210" cy="78" r="1.5" opacity="0.8" />
              <circle cx="340" cy="35" r="1" />
              <circle cx="480" cy="85" r="1.4" opacity="0.9" />
              <circle cx="680" cy="40" r="1" />
              <circle cx="820" cy="72" r="1.6" opacity="0.85" />
              <circle cx="970" cy="38" r="1.2" />
              <circle cx="1120" cy="65" r="1.4" />
            </g>
            {/* Layered Aurora Ribbons with slow atmospheric drift */}
            <path className="aurora-wave-secondary" d="M0 65Q280 15 590 70T1200 45v85Q860 175 550 115T0 145Z" fill="url(#auroraGrad2)" />
            <path className="aurora-wave" d="M0 90Q320 20 620 85T1200 60v90Q880 190 580 130T0 160Z" fill="url(#auroraGrad)" />
            {/* Antarctic Ridges and Ice Plains */}
            <path d="M0 260 140 150l150 85 170-115 180 110 170-95 170 85 140-75 80 65v150H0Z" fill="#152b47" />
            <path d="M0 278q360-28 720 0t480-10v92H0Z" fill="#081424" />
            {/* Maitri Station Module Architecture */}
            <g transform="translate(590 190)">
              <path d="M20 85V42h205v43M45 85V98m65-13V98m65-13V98m35-13V98" stroke="#475569" strokeWidth="5" fill="none" />
              <rect x="12" y="28" width="220" height="48" rx="5" fill="#1e293b" stroke="#64748b" strokeWidth="2" />
              <rect x="14" y="34" width="216" height="5" fill="#ea580c" />
              <g fill="#fbbf24"><rect x="30" y="50" width="22" height="13" rx="2" /><rect x="66" y="50" width="22" height="13" rx="2" /><rect x="102" y="50" width="22" height="13" rx="2" /><rect x="138" y="50" width="22" height="13" rx="2" /><rect x="174" y="50" width="22" height="13" rx="2" /></g>
              <path d="M200 27a18 14 0 0 1 36 0Z" fill="#e2e8f0" stroke="#475569" />
            </g>
            {/* Animated Indian Tricolor at Maitri */}
            <g transform="translate(535 152)">
              <path d="M0 0v142" stroke="#94a3b8" strokeWidth="3" />
              <g className="tiranga-flag-wave"><path d="M2 3q35-8 75 0v14q-40 8-75 0Z" fill="#ff671f" /><path d="M2 17q35-8 75 0v14q-40 8-75 0Z" fill="#fff" /><path d="M2 31q35-8 75 0v14q-40 8-75 0Z" fill="#046a38" /><circle cx="40" cy="24" r="5" fill="none" stroke="#06038d" strokeWidth="1.5" /></g>
            </g>
          </svg>

          <div className="hero-content-grid">
            <div className="hero-station-info">
              <div className="radar-badge-wrap"><div className="radar-sweep-ring" /><div className="radar-core-icon"><Icon name="radar" size={25} strokeWidth={1.6} /></div></div>
              <div>
                <div className="station-tag-row">
                  <span className="indian-tricolor-pill"><span className="band-saffron" /><span className="band-white" /><span className="band-green" /></span>
                  <span className="station-kicker">INDIAN ANTARCTIC RESEARCH STATION</span>
                </div>
                <h2 className="hero-station-title">{activeReading?.station_name ?? 'Polar Twin station profile'}</h2>
                <div className="station-meta-list"><span>{activeReading?.station_label ?? 'Station'} · Antarctica</span><span>Prototype profile</span></div>
              </div>
            </div>

            <div className="hero-controls-panel">
              <div className="control-group">
                <label htmlFor="station-select">SELECT STATION</label>
                <select id="station-select" className="polar-select" value={stationId} onChange={(event) => setStationId(event.target.value)} disabled={busy || (dataMode === 'api' && !edgeLinkOnline)}>
                  {(stations.length ? stations : [{ station_id: 'maitri-demo', label: 'Maitri' }, { station_id: 'bharati-demo', label: 'Bharati' }]).map((station) => <option key={station.station_id} value={station.station_id}>{station.label}</option>)}
                </select>
              </div>
              <div className="control-group">
                <label htmlFor="scenario-select">{dataMode === 'fallback' ? 'SEEDED DEMO STATE' : 'SIMULATED SCENARIO'}</label>
                <select id="scenario-select" className="polar-select" value={dataMode === 'fallback' ? fallbackScenario : isStorm ? 'storm' : 'normal'} onChange={(event) => dataMode === 'fallback' ? setFallbackScenario(event.target.value) : chooseScenario(event.target.value === 'storm' ? 'storm' : 'reset')} disabled={!activeReading || busy || (dataMode === 'api' && !edgeLinkOnline)}>
                  {dataMode === 'fallback' ? FALLBACK_SCENARIOS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>) : <><option value="normal">Normal conditions</option><option value="storm">Storm simulation</option></>}
                </select>
              </div>
              <div className="scenario-status-row"><span className={`scenario-pill status-${scenarioStyle}`}><span className="pulse-indicator" />{dataMode === 'fallback' ? FALLBACK_SCENARIOS.find((item) => item.id === fallbackScenario)?.label : activeReading?.what_if_scenario?.title ?? (isStorm ? 'Storm simulation' : 'Normal conditions')}</span></div>
            </div>
          </div>
        </section>

        <section className="operations-workspace" aria-label="Detailed station response workflow">
          <div className="workflow-heading">
            <div><p className="eyebrow">INCIDENT RESPONSE / END-TO-END</p><h3 className="section-title">Storm-to-delivery workflow</h3><p className="workflow-subtitle">Follow the operational chain from a station alert to verified fuel delivery.</p></div>
            <label className="role-switch">VIEW AS<select value={role} onChange={(event) => setRole(event.target.value)}><option>Station Leader</option><option>Logistics</option><option>Management</option></select></label>
          </div>
          <div className="ops-grid">
            <article className="glass-card station-3d-card">
              <div className="panel-heading-row"><div><p className="eyebrow">SPATIAL TWIN / SCHEMATIC</p><h4>Station systems view</h4></div><span className="tag-outline">3D SCHEMATIC</span></div>
              <StationTwin reading={activeReading} requisition={selectedRequisition} />
            </article>
            <article className="glass-card workflow-card">
              <div className="panel-heading-row"><div><p className="eyebrow">WORKFLOW / SERVER-OWNED STATE</p><h4>Fuel replenishment</h4></div><span className="tag-outline">{selectedRequisition?.status?.replaceAll('_', ' ').toUpperCase() ?? 'NO REQUEST'}</span></div>
              <div className="workflow-context"><span>TRIGGER</span><strong>{isStorm ? 'Storm demand increase · synthetic' : 'Preventive demo request'}</strong><span>ROLE VIEW</span><strong>{role} · demo only</strong></div>
              {dataMode === 'api' && displayedRequisitions.length > 0 && <label className="workflow-field">SELECT REQUEST<select className="polar-select workflow-input" value={selectedRequisitionId} onChange={(event) => setSelectedRequisitionId(event.target.value)}>{displayedRequisitions.map((item) => <option key={item.requisition_id} value={item.requisition_id}>{item.requisition_id} · {item.status.replaceAll('_', ' ')}</option>)}</select></label>}
              {selectedRequisition ? <>
                <div className="requisition-summary"><strong>{selectedRequisition.quantity} {selectedRequisition.unit} · {selectedRequisition.item_id}</strong><span>{selectedRequisition.reason}</span><small>Created by {selectedRequisition.requested_by.name} · {selectedRequisition.station_id}</small></div>
                <ol className="workflow-timeline">{displayedEvents.map((event, index) => <li className="step-done" key={`${event.occurred_at}-${index}`}><span className="step-marker"><Icon name="check" size={13} strokeWidth={2.2} /></span><div><div className="step-title-row"><strong>{event.action.replaceAll('_', ' ')}</strong><span>{new Date(event.occurred_at).toLocaleString()}</span></div><p>{event.notes || 'No note recorded.'}</p><small>{event.actor.role.replaceAll('_', ' ').toUpperCase()} · {event.actor.name} · {event.provenance}</small></div></li>)}</ol>
              </> : dataMode === 'fallback' ? <p className="workflow-empty">No seeded request is available for this station.</p> : role === 'Station Leader' ? <div className="workflow-form">
                <label className="workflow-field">QUANTITY (SYNTHETIC DEMO)<input className="workflow-input" type="number" min="1" value={requestQuantity} onChange={(event) => setRequestQuantity(event.target.value)} /></label>
                <label className="workflow-field">REASON<input className="workflow-input" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} /></label>
                <button className="btn-polar btn-primary" type="button" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest('/api/requisitions', { station_id: stationId, item_id: 'heating-fuel', quantity: Number(requestQuantity), unit: 'litres', reason: requestReason, linked_alert_id: isStorm ? `demo-${stationId}-storm` : null, actor })}>Create draft request</button>
              </div> : <p className="workflow-empty">No request yet. Switch to the Station Leader demo view to create one.</p>}
              {dataMode === 'fallback' && selectedRequisition && <p className="fallback-readonly-note">Read-only seeded workflow example. Actions are not sent to the API and cannot change API records.</p>}
              {dataMode === 'api' && selectedRequisition && <div className="workflow-controls">
                <label className="workflow-field">ACTION NOTE<input className="workflow-input" value={workflowNotes} onChange={(event) => setWorkflowNotes(event.target.value)} placeholder="Optional demo note" /></label>
                {role === 'Station Leader' && ['draft', 'changes_requested'].includes(selectedRequisition.status) && <div className="workflow-form"><label className="workflow-field">EDIT QUANTITY<input className="workflow-input" type="number" min="1" value={requestQuantity} onChange={(event) => setRequestQuantity(event.target.value)} /></label><label className="workflow-field">EDIT REASON<input className="workflow-input" value={requestReason} onChange={(event) => setRequestReason(event.target.value)} /></label><button className="btn-polar btn-secondary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/update`, { actor, quantity: Number(requestQuantity), unit: selectedRequisition.unit, reason: requestReason })}>Save request changes</button></div>}
                {role === 'Station Leader' && ['draft', 'changes_requested'].includes(selectedRequisition.status) && <button className="btn-polar btn-primary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/submit`, actionBody())}>Submit request</button>}
                {role === 'Logistics' && selectedRequisition.status === 'submitted' && <button className="btn-polar btn-primary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/review`, actionBody())}>Start logistics review</button>}
                {role === 'Management' && selectedRequisition.status === 'in_review' && <div className="workflow-button-row">{['approved', 'rejected', 'changes_requested'].map((decision) => <button key={decision} className={`btn-polar ${decision === 'approved' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/decision`, actionBody({ decision }))}>{decision.replaceAll('_', ' ')}</button>)}</div>}
                {role === 'Logistics' && selectedRequisition.status === 'approved' && <div className="workflow-form"><label className="workflow-field">SHIPMENT REFERENCE<input className="workflow-input" value={shipmentReference} onChange={(event) => setShipmentReference(event.target.value)} /></label><label className="workflow-field">SYNTHETIC ETA<input className="workflow-input" type="datetime-local" value={etaInput} onChange={(event) => setEtaInput(event.target.value)} /></label><button className="btn-polar btn-primary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/dispatch`, actionBody({ shipment_reference: shipmentReference, eta_at: new Date(etaInput).toISOString() }))}>Record dispatch & ETA</button></div>}
                {role === 'Logistics' && selectedRequisition.status === 'dispatched' && <div className="workflow-form"><label className="workflow-field">UPDATED SYNTHETIC ETA<input className="workflow-input" type="datetime-local" value={etaInput} onChange={(event) => setEtaInput(event.target.value)} /></label><button className="btn-polar btn-secondary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/eta`, actionBody({ eta_at: new Date(etaInput).toISOString() }))}>Update shipment ETA</button></div>}
                {role === 'Station Leader' && selectedRequisition.status === 'dispatched' && <div className="workflow-form"><label className="workflow-field">RECEIVED QUANTITY<input className="workflow-input" type="number" min="0.01" step="any" value={receivedQuantity} onChange={(event) => setReceivedQuantity(event.target.value)} /></label><button className="btn-polar btn-primary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/delivery`, actionBody({ received_quantity: Number(receivedQuantity) }))}>Confirm demo delivery</button></div>}
                {role === 'Station Leader' && selectedRequisition.status === 'delivered' && <button className="btn-polar btn-primary" disabled={busy || !edgeLinkOnline} onClick={() => workflowRequest(`/api/requisitions/${selectedRequisitionId}/close`, actionBody())}>Close workflow</button>}
              </div>}
              <div className="workflow-footer"><p>Dispatch and ETA changes update the shipment estimate above. All values and actions are synthetic demo records, not operational guidance.</p></div>
            </article>
          </div>
          <section className="scenario-lab" aria-label="Synthetic what-if scenarios">
            <div className="scenario-lab-heading"><div><p className="eyebrow">PHASE 2 / WHAT-IF SCENARIOS</p><h4>Explore a synthetic disruption</h4><p>One what-if can be active per station. Choosing another replaces the current preview; neither action changes requisitions or workflow history.</p></div><span className="tag-outline">SYNTHETIC MODEL</span></div>
            {whatIfScenario ? <div className="scenario-result">
              <div className="scenario-result-title"><strong>{whatIfScenario.title}</strong><span>{whatIfScenario.provenance?.replaceAll('_', ' ').toUpperCase()}</span></div>
              <div className="scenario-data-grid"><div><h5>Inputs</h5>{Object.entries(whatIfScenario.inputs).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{formatScenarioValue(key, value)}</strong></p>)}</div><div><h5>Illustrative effects</h5>{Object.entries(whatIfScenario.effects).map(([key, value]) => <p key={key}><span>{key.replaceAll('_', ' ')}</span><strong>{formatScenarioValue(key, value)}</strong></p>)}</div></div>
              <p className="scenario-explanation">{whatIfScenario.explanation}</p>
            </div> : <p className="scenario-empty">No what-if scenario is active. Current readings use the selected synthetic station profile.</p>}
            <div className="scenario-actions">
              {(role === 'Station Leader' || role === 'Management') && <button type="button" className="btn-polar btn-secondary" onClick={() => runWhatIf('generator_fault_during_storm')} disabled={busy || (dataMode === 'api' && !edgeLinkOnline)}>Run generator fault during storm</button>}
              {(role === 'Logistics' || role === 'Management') && <button type="button" className="btn-polar btn-secondary" onClick={() => runWhatIf('delayed_shipment')} disabled={busy || (dataMode === 'api' && !edgeLinkOnline)}>Delay shipment by 10 days</button>}
              {whatIfScenario && <button type="button" className="btn-polar btn-secondary" onClick={clearWhatIf} disabled={busy || (dataMode === 'api' && !edgeLinkOnline)}>Clear what-if</button>}
            </div>
            <p className="scenario-disclaimer">All scenario inputs, power effects, fuel demand, and shipment estimates are illustrative and synthetic. They are not live station data, validated thresholds, or operational guidance.</p>
          </section>
          <p className="provenance-inline">PROVENANCE · SIMULATED PROTOTYPE DATA · SCHEMATIC GEOMETRY FOR WORKFLOW DEMONSTRATION</p>
        </section>

        <section className="section-bar">
          <div><p className="eyebrow">STATION TWIN</p><h3 className="section-title">Current conditions</h3></div>
          <div className="section-bar-actions">
            <div className="sim-badge"><span className="sim-dot" /> {dataMode === 'fallback' ? 'SEEDED OFFLINE DEMO DATA' : 'SYNTHETIC DATA FROM LOCAL API'}</div>
            <div className="report-controls"><button type="button" className="btn-polar btn-secondary" onClick={() => exportReport('csv')} disabled={!activeReading}><Icon name="fileCsv" size={16} />Export CSV</button><button type="button" className="btn-polar btn-secondary" onClick={() => exportReport('pdf')} disabled={!activeReading}><Icon name="printer" size={16} />Print / Save PDF</button></div>
          </div>
        </section>
        {reportError && <div className="error-banner report-error" role="alert">{reportError}</div>}

        <section className="telemetry-grid" aria-label="Current station readings">
          <article className="glass-card">
            <div className="card-top"><div className="card-icon ice"><Icon name="snowflake" size={20} /></div><span className="card-category">ENVIRONMENT</span></div>
            <div className="card-metric-label">Storm severity</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? `${Math.round(activeReading.weather.storm_severity * 100)}%` : '—'}</span><span className={`metric-badge ${isStorm ? 'sev-katabatic' : 'sev-normal'}`}>{isStorm ? 'Elevated' : 'Low'}</span></div>
            <div className="progress-track"><div className={`progress-fill ${isStorm ? 'fill-katabatic' : 'fill-normal'}`} style={{ width: `${(activeReading?.weather.storm_severity ?? 0) * 100}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Outdoor temperature</span><strong className="sub-val">{activeReading ? `${activeReading.weather.temperature_c}°C` : '—'}</strong></div><div className="right-align"><span className="sub-label">Reading source</span><strong className="sub-val">Synthetic</strong></div></div>
          </article>

          <article className="glass-card">
            <div className="card-top"><div className="card-icon thermal"><Icon name="flame" size={20} /></div><span className="card-category">ENERGY</span></div>
            <div className="card-metric-label">Heating load</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? activeReading.energy.heating_load_kw : '—'} <small>kW</small></span><span className="metric-badge neutral">{isStorm ? 'Increased' : 'Steady'}</span></div>
            <div className="progress-track"><div className="progress-fill fill-thermal" style={{ width: `${Math.min(((activeReading?.energy.heating_load_kw ?? 0) / 60) * 100, 100)}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Normal baseline</span><strong className="sub-val">{activeReading ? `${activeReading.energy.baseline_heating_load_kw} kW` : '—'}</strong></div><div className="right-align"><span className="sub-label">Change from baseline</span><strong className="sub-val">{activeReading ? `${activeReading.energy.heating_load_kw - activeReading.energy.baseline_heating_load_kw >= 0 ? '+' : ''}${activeReading.energy.heating_load_kw - activeReading.energy.baseline_heating_load_kw} kW` : '—'}</strong></div></div>
          </article>

          <article className="glass-card">
            <div className="card-top"><div className="card-icon supply"><Icon name="fuel" size={20} /></div><span className="card-category">SUPPLY</span></div>
            <div className="card-metric-label">Fuel remaining</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? activeReading.energy.fuel_percent : '—'}<small>%</small></span><span className={`metric-badge ${inventoryAtRisk ? 'sev-katabatic' : 'emerald'}`}>{inventoryAtRisk ? 'At risk' : isStorm ? 'Decreasing' : 'Available'}</span></div>
            <div className="progress-track"><div className="progress-fill fill-supply" style={{ width: `${activeReading?.energy.fuel_percent ?? 0}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Estimated stock-out</span><strong className="sub-val">{inventory ? `In ${inventory.stockout_in_days} days` : '—'}</strong></div><div className="right-align"><span className="sub-label">Shipment estimate</span><strong className="sub-val">{inventory ? `In ${inventory.shipment_eta_in_days} days` : '—'}</strong></div></div>
          </article>
        </section>

        <section className={`alert-card alert-${alertLevel}`} aria-live="polite">
          <div className="alert-symbol"><Icon name={alertLevel === 'normal' ? 'shieldCheck' : alertLevel === 'critical' ? 'alertCritical' : 'alert'} size={22} strokeWidth={1.8} /></div>
          <div className="alert-copy">
            <div className="alert-title-row"><span className="alert-kicker">SYSTEM ALERT · SYNTHETIC</span><span className={`severity ${alertLevel}`}>{alertLevel.toUpperCase()}</span></div>
            <h3>{alertLevel === 'critical' ? 'Critical demo thresholds are active' : alertLevel === 'warning' ? 'Sustained demo warning conditions' : 'No active alert'}</h3>
            <p>{activeReading?.alert?.reason ?? 'Loading the latest station status.'}</p>
            {activeReading?.alert?.pending_transition && <p className="alert-pending">{activeReading.alert.pending_transition}</p>}
            {activeReading?.alert?.inputs && <div className="alert-inputs">Inputs: storm {activeReading.alert.inputs.storm_severity_percent}% · generation {activeReading.alert.inputs.generation_available_percent}% · fuel {activeReading.alert.inputs.fuel_percent}% · shipment {activeReading.alert.inputs.inventory_status}{activeReading.alert.inputs.inventory_status === 'risk' ? ` (${activeReading.alert.inputs.shortfall_days}-day gap)` : ` (${activeReading.alert.inputs.arrival_buffer_days}-day buffer)`}</div>}
            <small>Promotion: 10 seconds sustained · Recovery: 20 seconds below separate recovery limits · illustrative thresholds</small>
          </div>
        </section>

        <section className="health-panel glass-card" aria-label="Illustrative station health score">
          <div className="panel-heading-row"><div className="panel-title-with-badge"><span className="header-badge-icon health"><Icon name="pulse" size={16} /></span><div><p className="eyebrow">SYNTHETIC ASSESSMENT</p><h4>Station health</h4></div></div><div className="health-total"><strong>{activeReading?.health?.score ?? '—'}</strong><span>/ 100</span></div></div>
          <p className="health-change">{activeReading?.health?.change_reason ?? 'Waiting for an assessment.'}</p>
          <div className="health-components">{Object.entries(activeReading?.health?.components ?? {}).map(([name, component]) => <div className="health-component" key={name}><div><span>{name}</span><strong>{component.score}</strong></div><div className="health-track"><i style={{ width: `${component.score}%` }} /></div><small>{component.reason}</small></div>)}</div>
          <p className="panel-footnote">Equal weights: 25% each. Scores and inputs are illustrative synthetic demo values, not a validated safety measure.</p>
        </section>

        <section className="logistics-grid">
          <article className="glass-card wide-panel shipment-panel">
            <p className="eyebrow">LOGISTICS / FUEL PLANNING</p>
            <div className="logistics-header"><div className="panel-title-with-badge"><span className="header-badge-icon logistics"><Icon name="truck" size={16} /></span><h4>Shipment outlook</h4></div><span className="tag-outline">SIMULATED ESTIMATE</span></div>
            <p className="logistics-desc">Compare the estimated fuel stock-out date with the illustrative shipment arrival date for this scenario.</p>
            <div className="mini-stats-row">
              <div className="mini-stat"><span>ESTIMATED STOCK-OUT</span><strong>{formatDate(inventory?.stockout_date)}</strong></div>
              <div className="mini-stat"><span>SHIPMENT ETA</span><strong>{formatDate(inventory?.shipment_eta_date)}</strong></div>
              <div className="mini-stat"><span>DELIVERY CHECK</span><strong className={inventoryAtRisk ? 'risk-text' : 'emerald-text'}>{inventoryAtRisk ? `${inventory.shortfall_days}-day gap` : `${inventory?.arrival_buffer_days ?? 0}-day buffer`}</strong></div>
            </div>
            <p className="panel-footnote">These dates use synthetic demo values. They are not verified schedules or operational guidance.</p>
          </article>

          <article className="glass-card edge-panel">
            <p className="eyebrow">OFFLINE DEMO</p>
            <div className="panel-title-with-badge"><span className="header-badge-icon telemetry"><Icon name={edgeLinkOnline ? "wifi" : "wifiOff"} size={16} /></span><h4>Telemetry buffer</h4></div>
            <p className="logistics-desc">{dataMode === 'fallback' ? 'This remains a separate API sync demo. Seeded fallback examples are not queued or sent to the API.' : 'Simulate a link outage. New synthetic readings are stored in this browser and can be synced when the demo link returns.'}</p>
            <div className="edge-summary"><div><span>QUEUED READINGS</span><strong>{queuedReadings.length}</strong></div><div><span>BUFFER SIZE</span><strong>{formatBytes(queuedBytes)}</strong></div></div>
            <div className="edge-controls">
              <button type="button" className={`btn-polar ${edgeLinkOnline ? 'btn-secondary' : 'btn-danger'}`} disabled={dataMode !== 'api' || syncing || (edgeLinkOnline && loading)} onClick={edgeLinkOnline ? () => { setEdgeLinkOnline(false); setSyncFeedback('Demo link is offline. New synthetic readings will be queued in this browser.'); } : reconnectAndSync}>{dataMode !== 'api' ? 'Available in API mode' : syncing ? 'Syncing…' : edgeLinkOnline ? 'Simulate link outage' : `Reconnect & sync (${queuedReadings.length})`}</button>
              {lastSync && <small className="sync-result">Last sync: {lastSync.accepted} readings · {formatBytes(lastSync.sent)} sent of {formatBytes(lastSync.raw)} ({lastSync.compression}).</small>}
              <small className="sync-feedback">{syncFeedback}</small>
            </div>
          </article>
        </section>

        <footer className="prototype-notice"><span className="notice-icon"><Icon name="info" size={16} strokeWidth={2} /></span><p><strong>Prototype data notice</strong><br />{dataMode === 'fallback' ? 'Seeded offline examples are not retrieved live and are not persisted by the API. ' : ''}All readings and shipment estimates are synthetic examples for demonstration. They are not live telemetry or operational guidance for Maitri, Bharati, or any Antarctic station.</p><button type="button" className="refresh-button" onClick={refresh} aria-label="Refresh readings" title="Refresh readings" disabled={dataMode !== 'api' || !edgeLinkOnline}><Icon name="refresh" size={17} /></button></footer>
      </main>
    </div>
  );
}
