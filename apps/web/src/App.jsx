import { useCallback, useEffect, useState } from 'react';
import { loadQueuedReadings, prepareBatch, saveQueuedReadings } from './edgeQueue.js';

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatBytes(value) {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function formatTime(value) {
  if (!value) return 'Waiting for first reading';
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  const [syncFeedback, setSyncFeedback] = useState('Telemetry sync is active.');
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
      setSyncFeedback('Link is offline. New readings are safely queued on this device.');
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeReading, edgeLinkOnline, stationId]);

  async function reconnectAndSync() {
    const pending = loadQueuedReadings();
    setEdgeLinkOnline(true);
    if (pending.length === 0) {
      setSyncFeedback('Link is back online. There are no readings waiting to sync.');
      return;
    }

    setSyncing(true);
    setSyncFeedback('Compressing and syncing the queued batch…');
    try {
      const batch = await prepareBatch(pending);
      const headers = { 'Content-Type': 'application/json' };
      if (batch.compressed) headers['Content-Encoding'] = 'gzip';
      const response = await fetch('/api/telemetry/sync', {
        method: 'POST',
        headers,
        body: batch.body,
      });
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
      setSyncFeedback(`${result.accepted_readings} readings synced successfully.`);
    } catch {
      setEdgeLinkOnline(false);
      setSyncFeedback('Sync failed. Readings remain saved on this device; try reconnecting again.');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Polar Twin home">
          <span className="brand-mark">P</span>
          <span>POLAR <b>TWIN</b></span>
        </a>
        <div className="topbar-right">
          <span className="prototype-label"><span className="pulse-dot" /> PROTOTYPE</span>
          <span className="user-avatar" aria-label="Demo user">CT</span>
        </div>
      </header>

      <div className="content" id="top">
        <section className="intro-row">
          <div>
            <p className="eyebrow">STATION OPERATIONS / DEMO ENVIRONMENT</p>
            <h1>Station overview</h1>
            <p className="intro-copy">A clear view of changing conditions at the edge of the map.</p>
          </div>
          <div className="updated-card">
            <span className="updated-label">LAST READING</span>
            <strong>{loading ? 'Loading…' : formatTime(activeReading?.observed_at)}</strong>
          </div>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="station-banner" aria-label="Station identity">
          <div className="station-symbol" aria-hidden="true"><span>⌁</span></div>
          <div className="station-name">
            <span className="eyebrow">INDIAN ANTARCTIC RESEARCH STATION</span>
            <h2>{activeReading?.station_name ?? (stationId === 'bharati-demo' ? 'Bharati demo station' : 'Maitri demo station')}</h2>
            <span className="station-location"><span className="location-pin">●</span> {activeReading?.station_label ?? (stationId === 'bharati-demo' ? 'Bharati' : 'Maitri')} · Antarctica</span>
          </div>
          <div className="station-state">
            <label className="state-label" htmlFor="station-select">SELECT STATION</label>
            <select
              className="station-select"
              id="station-select"
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
              disabled={stations.length === 0 || busy || !edgeLinkOnline}
            >
              {stations.map((station) => (
                <option key={station.station_id} value={station.station_id}>{station.label}</option>
              ))}
            </select>
            <span className="state-label">CURRENT SCENARIO</span>
            <span className={`scenario-pill ${isStorm ? 'storm' : ''}`}>
              <span className="state-dot" /> {loading ? 'Loading station…' : isStorm ? 'Storm simulation' : 'Normal conditions'}
            </span>
          </div>
        </section>

        <section className="section-heading">
          <div>
            <p className="eyebrow">LIVE STATION TWIN</p>
            <h2>Current conditions</h2>
          </div>
          <span className="provenance"><span className="provenance-dot" /> SIMULATED DATA</span>
        </section>

        <section className="metrics-grid" aria-label="Current station readings">
          <article className="metric-card weather-card">
            <div className="metric-top"><span className="metric-icon snow">❄</span><span className="metric-context">ENVIRONMENT</span></div>
            <p className="metric-label">Storm severity</p>
            <div className="metric-value-row"><strong>{activeReading ? `${Math.round(activeReading.weather.storm_severity * 100)}%` : '—'}</strong><span className={`trend ${isStorm ? 'trend-up' : ''}`}>{isStorm ? 'Elevated' : 'Low'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-high' : ''} style={{ width: `${(activeReading?.weather.storm_severity ?? 0) * 100}%` }} /></div>
            <p className="metric-foot">Outdoor temperature <b>{activeReading ? `${activeReading.weather.temperature_c}°C` : '—'}</b></p>
          </article>

          <article className="metric-card energy-card">
            <div className="metric-top"><span className="metric-icon heat">ϟ</span><span className="metric-context">ENERGY</span></div>
            <p className="metric-label">Heating load</p>
            <div className="metric-value-row"><strong>{activeReading ? `${activeReading.energy.heating_load_kw}` : '—'}<small> kW</small></strong><span className={`trend ${isStorm ? 'trend-up' : ''}`}>{isStorm ? '↑ Increased' : 'Steady'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-warm' : ''} style={{ width: `${Math.min(((activeReading?.energy.heating_load_kw ?? 0) / 60) * 100, 100)}%` }} /></div>
            <p className="metric-foot">Demo baseline <b>{activeReading ? `${activeReading.energy.baseline_heating_load_kw} kW` : '—'}</b></p>
          </article>

          <article className="metric-card fuel-card">
            <div className="metric-top"><span className="metric-icon fuel">◒</span><span className="metric-context">SUPPLY</span></div>
            <p className="metric-label">Fuel remaining</p>
            <div className="metric-value-row"><strong>{activeReading ? `${activeReading.energy.fuel_percent}` : '—'}<small>%</small></strong><span className={`trend ${isStorm ? 'trend-down' : ''}`}>{isStorm ? '↓ Decreasing' : 'Available'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-low' : ''} style={{ width: `${activeReading?.energy.fuel_percent ?? 0}%` }} /></div>
            <p className="metric-foot">Simulated station reserve</p>
          </article>
        </section>

        <section className="shipment-card" aria-label="Fuel shipment outlook">
          <div className="shipment-heading">
            <div>
              <p className="eyebrow">LOGISTICS / FUEL PLANNING</p>
              <h2>Shipment outlook</h2>
            </div>
            <span className="shipment-demo-tag">SIMULATED ESTIMATE</span>
          </div>
          <div className="shipment-details">
            <article className="shipment-date">
              <span className="shipment-date-icon stock">◷</span>
              <div>
                <span className="shipment-label">ESTIMATED STOCK-OUT</span>
                <strong>{formatDate(inventory?.stockout_date)}</strong>
                <small>{inventory ? `In ${inventory.stockout_in_days} days` : 'Waiting for reading'}</small>
              </div>
            </article>
            <div className="shipment-arrow" aria-hidden="true">→</div>
            <article className="shipment-date">
              <span className="shipment-date-icon arrival">⇢</span>
              <div>
                <span className="shipment-label">SHIPMENT ETA</span>
                <strong>{formatDate(inventory?.shipment_eta_date)}</strong>
                <small>{inventory ? `In ${inventory.shipment_eta_in_days} days` : 'Waiting for reading'}</small>
              </div>
            </article>
            <div className={`shipment-result ${inventoryAtRisk ? 'risk' : 'safe'}`}>
              <span className="shipment-result-icon">{inventoryAtRisk ? '!' : '✓'}</span>
              <div>
                <span className="shipment-label">DELIVERY CHECK</span>
                <strong>{inventoryAtRisk ? `${inventory.shortfall_days}-day gap` : `${inventory?.arrival_buffer_days ?? 0}-day buffer`}</strong>
                <small>{inventoryAtRisk ? 'Fuel may run out before delivery.' : 'Shipment is expected before stock-out.'}</small>
              </div>
            </div>
          </div>
          <p className="shipment-note">{inventoryAtRisk ? 'Consider reviewing the shipment plan in this demo scenario.' : 'Estimate uses illustrative demo values; verify real inventory and shipment schedules before acting.'}</p>
        </section>

        <section className="edge-card" aria-label="Station telemetry link and buffer">
          <div className="edge-heading">
            <div>
              <p className="eyebrow">STATION EDGE AGENT</p>
              <h2>Telemetry link</h2>
            </div>
            <span className={`edge-status ${edgeLinkOnline ? 'connected' : 'disconnected'}`}>
              <span className="edge-status-dot" /> {edgeLinkOnline ? 'LINK CONNECTED' : 'LINK OFFLINE'}
            </span>
          </div>
          <div className="edge-content">
            <div className="edge-copy">
              <p>{syncFeedback}</p>
              {lastSync && <small>Last batch: {lastSync.accepted} readings · {formatBytes(lastSync.sent)} sent of {formatBytes(lastSync.raw)} uncompressed ({lastSync.compression}).</small>}
            </div>
            <div className="edge-stats">
              <div><span>QUEUED READINGS</span><strong>{queuedReadings.length}</strong></div>
              <div><span>BUFFER SIZE</span><strong>{formatBytes(queuedBytes)}</strong></div>
            </div>
            <button
              className={`button ${edgeLinkOnline ? 'button-outage' : 'button-sync'}`}
              onClick={edgeLinkOnline && queuedReadings.length === 0 ? () => {
                setEdgeLinkOnline(false);
                setSyncFeedback('Link is offline. The edge agent will queue new readings on this device.');
              } : reconnectAndSync}
              disabled={syncing || (edgeLinkOnline && loading)}
            >
              {syncing ? 'Syncing…' : edgeLinkOnline && queuedReadings.length === 0 ? 'Simulate link outage' : edgeLinkOnline ? `Sync queued (${queuedReadings.length})` : `Reconnect & sync (${queuedReadings.length})`}
            </button>
          </div>
          <p className="edge-note">Offline readings stay in this browser until the link reconnects. Sync sends them as a compressed batch when supported.</p>
        </section>

        <section className={`alert-card ${alertLevel === 'warning' ? 'alert-warning' : ''}`} aria-live="polite">
          <div className="alert-symbol">{alertLevel === 'warning' ? '!' : '✓'}</div>
          <div className="alert-copy">
            <div className="alert-title-row"><span className="alert-kicker">SYSTEM ALERT</span><span className={`severity ${alertLevel}`}>{alertLevel.toUpperCase()}</span></div>
            <h3>{alertLevel === 'warning' ? 'Storm conditions affecting energy' : 'Station systems look steady'}</h3>
            <p>{activeReading?.alert?.reason ?? 'Loading the latest station status.'}</p>
          </div>
          <span className="alert-time">JUST NOW</span>
        </section>

        <section className="scenario-section">
          <div className="scenario-copy">
            <p className="eyebrow">SAFE WHAT-IF TEST</p>
            <h2>Try a scenario</h2>
            <p>Explore how changing conditions affect the station. This changes simulated demo values only.</p>
          </div>
          <div className="scenario-actions">
            <button className={`button button-storm ${isStorm ? 'selected' : ''}`} onClick={() => chooseScenario('storm')} disabled={busy || loading || isStorm || !edgeLinkOnline}>
              <span aria-hidden="true">❄</span> {busy ? 'Updating…' : 'Start storm'}
            </button>
            <button className="button button-reset" onClick={() => chooseScenario('reset')} disabled={busy || loading || !isStorm || !edgeLinkOnline}>
              Reset to normal
            </button>
          </div>
        </section>

        <footer className="footer-note">
          <span className="footer-icon">i</span>
          <p><b>Prototype data notice</b><br />All readings are synthetic examples for demonstration. Thresholds are illustrative and are not operational guidance for Maitri, Bharati, or any Antarctic station.</p>
          <button className="refresh-button" onClick={refresh} aria-label="Refresh readings" title="Refresh readings" disabled={!edgeLinkOnline}>↻</button>
        </footer>
      </div>
    </main>
  );
}
