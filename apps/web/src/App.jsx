import { useCallback, useEffect, useState } from 'react';
import { loadQueuedReadings, prepareBatch, saveQueuedReadings } from './edgeQueue.js';

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

export default function App() {
  const [reading, setReading] = useState(null);
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState('maitri-demo');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [edgeLinkOnline, setEdgeLinkOnline] = useState(true);
  const [queuedReadings, setQueuedReadings] = useState(loadQueuedReadings);
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState('Demo link is online. Readings come from the local prototype API.');
  const [lastSync, setLastSync] = useState(null);

  const refresh = useCallback(async () => {
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
  }, [stationId]);

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
    setLoading(true);
    refresh();
  }, [refresh]);

  async function chooseScenario(scenario) {
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

  const activeReading = reading?.station_id === stationId ? reading : null;
  const isStorm = activeReading?.scenario === 'storm';
  const scenarioStyle = isStorm ? 'katabatic' : 'normal';
  const alertLevel = activeReading?.alert?.level ?? 'normal';
  const inventory = activeReading?.inventory;
  const inventoryAtRisk = inventory?.status === 'risk';
  const queuedBytes = new TextEncoder().encode(JSON.stringify(queuedReadings)).byteLength;

  useEffect(() => {
    if (edgeLinkOnline || !activeReading) return undefined;
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
  }, [activeReading, edgeLinkOnline, stationId]);

  async function reconnectAndSync() {
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
            <div className={`telemetry-pill ${edgeLinkOnline ? 'emerald' : 'amber'}`}>
              <span className="status-dot" />
              {edgeLinkOnline ? 'DEMO LINK ONLINE' : `LOCAL BUFFERING (${queuedReadings.length})`}
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

        <section className="antarctic-hero-card" aria-label="Selected Antarctic station">
          <svg className="hero-scene-svg" viewBox="0 0 1200 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
              <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#050d1a" /><stop offset="1" stopColor="#163859" /></linearGradient>
              <linearGradient id="auroraGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#10b981" stopOpacity="0" /><stop offset="0.5" stopColor="#2dd4bf" stopOpacity="0.35" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
            </defs>
            <rect width="1200" height="360" fill="url(#skyGrad)" />
            <path className="aurora-wave" d="M0 90Q320 20 620 85T1200 60v90Q880 190 580 130T0 160Z" fill="url(#auroraGrad)" />
            <path d="M0 260 140 150l150 85 170-115 180 110 170-95 170 85 140-75 80 65v150H0Z" fill="#1e3a5f" />
            <path d="M0 278q360-28 720 0t480-10v92H0Z" fill="#091526" />
            <g transform="translate(590 190)">
              <path d="M20 85V42h205v43M45 85V98m65-13V98m65-13V98m35-13V98" stroke="#64748b" strokeWidth="5" fill="none" />
              <rect x="12" y="28" width="220" height="48" rx="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
              <rect x="14" y="34" width="216" height="5" fill="#ea580c" />
              <g fill="#fbbf24"><rect x="30" y="50" width="22" height="13" rx="2" /><rect x="66" y="50" width="22" height="13" rx="2" /><rect x="102" y="50" width="22" height="13" rx="2" /><rect x="138" y="50" width="22" height="13" rx="2" /><rect x="174" y="50" width="22" height="13" rx="2" /></g>
              <path d="M200 27a18 14 0 0 1 36 0Z" fill="#e2e8f0" stroke="#475569" />
            </g>
            <g transform="translate(535 152)">
              <path d="M0 0v142" stroke="#cbd5e1" strokeWidth="3" />
              <g className="tiranga-flag-wave"><path d="M2 3q35-8 75 0v14q-40 8-75 0Z" fill="#ff671f" /><path d="M2 17q35-8 75 0v14q-40 8-75 0Z" fill="#fff" /><path d="M2 31q35-8 75 0v14q-40 8-75 0Z" fill="#046a38" /><circle cx="40" cy="24" r="5" fill="none" stroke="#06038d" strokeWidth="1.5" /></g>
            </g>
          </svg>

          <div className="hero-content-grid">
            <div className="hero-station-info">
              <div className="radar-badge-wrap"><div className="radar-sweep-ring" /><div className="radar-core-icon">⌁</div></div>
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
                <select id="station-select" className="polar-select" value={stationId} onChange={(event) => setStationId(event.target.value)} disabled={!stations.length || busy || !edgeLinkOnline}>
                  {stations.map((station) => <option key={station.station_id} value={station.station_id}>{station.label}</option>)}
                </select>
              </div>
              <div className="control-group">
                <label htmlFor="scenario-select">SIMULATED SCENARIO</label>
                <select id="scenario-select" className="polar-select" value={isStorm ? 'storm' : 'normal'} onChange={(event) => chooseScenario(event.target.value === 'storm' ? 'storm' : 'reset')} disabled={!activeReading || busy || !edgeLinkOnline}>
                  <option value="normal">Normal conditions</option>
                  <option value="storm">Storm simulation</option>
                </select>
              </div>
              <div className="scenario-status-row"><span className={`scenario-pill status-${scenarioStyle}`}><span className="pulse-indicator" />{isStorm ? 'Storm simulation' : 'Normal conditions'}</span></div>
            </div>
          </div>
        </section>

        <section className="section-bar">
          <div><p className="eyebrow">STATION TWIN</p><h3 className="section-title">Current conditions</h3></div>
          <div className="sim-badge"><span className="sim-dot" /> SIMULATED DATA FROM LOCAL API</div>
        </section>

        <section className="telemetry-grid" aria-label="Current station readings">
          <article className="glass-card">
            <div className="card-top"><div className="card-icon ice">❄</div><span className="card-category">ENVIRONMENT</span></div>
            <div className="card-metric-label">Storm severity</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? `${Math.round(activeReading.weather.storm_severity * 100)}%` : '—'}</span><span className={`metric-badge ${isStorm ? 'sev-katabatic' : 'sev-normal'}`}>{isStorm ? 'Elevated' : 'Low'}</span></div>
            <div className="progress-track"><div className={`progress-fill ${isStorm ? 'fill-katabatic' : 'fill-normal'}`} style={{ width: `${(activeReading?.weather.storm_severity ?? 0) * 100}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Outdoor temperature</span><strong className="sub-val">{activeReading ? `${activeReading.weather.temperature_c}°C` : '—'}</strong></div><div className="right-align"><span className="sub-label">Reading source</span><strong className="sub-val">Synthetic</strong></div></div>
          </article>

          <article className="glass-card">
            <div className="card-top"><div className="card-icon thermal">ϟ</div><span className="card-category">ENERGY</span></div>
            <div className="card-metric-label">Heating load</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? activeReading.energy.heating_load_kw : '—'} <small>kW</small></span><span className="metric-badge neutral">{isStorm ? 'Increased' : 'Steady'}</span></div>
            <div className="progress-track"><div className="progress-fill fill-thermal" style={{ width: `${Math.min(((activeReading?.energy.heating_load_kw ?? 0) / 60) * 100, 100)}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Normal baseline</span><strong className="sub-val">{activeReading ? `${activeReading.energy.baseline_heating_load_kw} kW` : '—'}</strong></div><div className="right-align"><span className="sub-label">Change from baseline</span><strong className="sub-val">{activeReading ? `${activeReading.energy.heating_load_kw - activeReading.energy.baseline_heating_load_kw >= 0 ? '+' : ''}${activeReading.energy.heating_load_kw - activeReading.energy.baseline_heating_load_kw} kW` : '—'}</strong></div></div>
          </article>

          <article className="glass-card">
            <div className="card-top"><div className="card-icon supply">◒</div><span className="card-category">SUPPLY</span></div>
            <div className="card-metric-label">Fuel remaining</div>
            <div className="card-metric-row"><span className="metric-value">{activeReading ? activeReading.energy.fuel_percent : '—'}<small>%</small></span><span className={`metric-badge ${inventoryAtRisk ? 'sev-katabatic' : 'emerald'}`}>{inventoryAtRisk ? 'At risk' : isStorm ? 'Decreasing' : 'Available'}</span></div>
            <div className="progress-track"><div className="progress-fill fill-supply" style={{ width: `${activeReading?.energy.fuel_percent ?? 0}%` }} /></div>
            <div className="card-footer-split"><div><span className="sub-label">Estimated stock-out</span><strong className="sub-val">{inventory ? `In ${inventory.stockout_in_days} days` : '—'}</strong></div><div className="right-align"><span className="sub-label">Shipment estimate</span><strong className="sub-val">{inventory ? `In ${inventory.shipment_eta_in_days} days` : '—'}</strong></div></div>
          </article>
        </section>

        <section className={`alert-card ${alertLevel === 'warning' ? 'alert-warning' : ''}`} aria-live="polite">
          <div className="alert-symbol">{alertLevel === 'warning' ? '!' : '✓'}</div>
          <div className="alert-copy"><div className="alert-title-row"><span className="alert-kicker">SYSTEM ALERT</span><span className={`severity ${alertLevel}`}>{alertLevel.toUpperCase()}</span></div><h3>{alertLevel === 'warning' ? 'Storm conditions affecting energy' : 'Station systems look steady'}</h3><p>{activeReading?.alert?.reason ?? 'Loading the latest station status.'}</p></div>
        </section>

        <section className="logistics-grid">
          <article className="glass-card wide-panel shipment-panel">
            <p className="eyebrow">LOGISTICS / FUEL PLANNING</p>
            <div className="logistics-header"><h4>Shipment outlook</h4><span className="tag-outline">SIMULATED ESTIMATE</span></div>
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
            <h4>Telemetry buffer</h4>
            <p className="logistics-desc">Simulate a link outage. New synthetic readings are stored in this browser and can be synced when the demo link returns.</p>
            <div className="edge-summary"><div><span>QUEUED READINGS</span><strong>{queuedReadings.length}</strong></div><div><span>BUFFER SIZE</span><strong>{formatBytes(queuedBytes)}</strong></div></div>
            <div className="edge-controls">
              <button type="button" className={`btn-polar ${edgeLinkOnline ? 'btn-secondary' : 'btn-danger'}`} disabled={syncing || (edgeLinkOnline && loading)} onClick={edgeLinkOnline ? () => { setEdgeLinkOnline(false); setSyncFeedback('Demo link is offline. New synthetic readings will be queued in this browser.'); } : reconnectAndSync}>{syncing ? 'Syncing…' : edgeLinkOnline ? 'Simulate link outage' : `Reconnect & sync (${queuedReadings.length})`}</button>
              {lastSync && <small className="sync-result">Last sync: {lastSync.accepted} readings · {formatBytes(lastSync.sent)} sent of {formatBytes(lastSync.raw)} ({lastSync.compression}).</small>}
              <small className="sync-feedback">{syncFeedback}</small>
            </div>
          </article>
        </section>

        <footer className="prototype-notice"><span className="notice-icon">i</span><p><strong>Prototype data notice</strong><br />All readings and shipment estimates are synthetic examples for demonstration. They are not live telemetry or operational guidance for Maitri, Bharati, or any Antarctic station.</p><button type="button" className="refresh-button" onClick={refresh} aria-label="Refresh readings" title="Refresh readings" disabled={!edgeLinkOnline}>↻</button></footer>
      </main>
    </div>
  );
}
