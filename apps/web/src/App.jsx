import { useCallback, useEffect, useState } from 'react';

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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/station/latest');
      if (!response.ok) throw new Error('The station API returned an error.');
      setReading(await response.json());
      setError('');
    } catch {
      setError('Cannot reach the local API. Start the API service, then refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function chooseScenario(scenario) {
    setBusy(true);
    try {
      const response = await fetch(`/api/scenario/${scenario}`, { method: 'POST' });
      if (!response.ok) throw new Error('Scenario could not be started.');
      setReading(await response.json());
      setError('');
    } catch {
      setError('Could not update the scenario. Check that the local API is running.');
    } finally {
      setBusy(false);
    }
  }

  const isStorm = reading?.scenario === 'storm';
  const alertLevel = reading?.alert?.level ?? 'normal';

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
            <strong>{loading ? 'Loading…' : formatTime(reading?.observed_at)}</strong>
          </div>
        </section>

        {error && <div className="error-banner" role="alert">{error}</div>}

        <section className="station-banner" aria-label="Station identity">
          <div className="station-symbol" aria-hidden="true"><span>⌁</span></div>
          <div className="station-name">
            <span className="eyebrow">INDIAN ANTARCTIC RESEARCH STATION</span>
            <h2>{reading?.station_name ?? 'Maitri demo station'}</h2>
            <span className="station-location"><span className="location-pin">●</span> Maitri · Antarctica</span>
          </div>
          <div className="station-state">
            <span className="state-label">CURRENT SCENARIO</span>
            <span className={`scenario-pill ${isStorm ? 'storm' : ''}`}>
              <span className="state-dot" /> {isStorm ? 'Storm simulation' : 'Normal conditions'}
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
            <div className="metric-value-row"><strong>{reading ? `${Math.round(reading.weather.storm_severity * 100)}%` : '—'}</strong><span className={`trend ${isStorm ? 'trend-up' : ''}`}>{isStorm ? 'Elevated' : 'Low'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-high' : ''} style={{ width: `${(reading?.weather.storm_severity ?? 0) * 100}%` }} /></div>
            <p className="metric-foot">Outdoor temperature <b>{reading ? `${reading.weather.temperature_c}°C` : '—'}</b></p>
          </article>

          <article className="metric-card energy-card">
            <div className="metric-top"><span className="metric-icon heat">ϟ</span><span className="metric-context">ENERGY</span></div>
            <p className="metric-label">Heating load</p>
            <div className="metric-value-row"><strong>{reading ? `${reading.energy.heating_load_kw}` : '—'}<small> kW</small></strong><span className={`trend ${isStorm ? 'trend-up' : ''}`}>{isStorm ? '↑ Increased' : 'Steady'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-warm' : ''} style={{ width: `${Math.min(((reading?.energy.heating_load_kw ?? 0) / 60) * 100, 100)}%` }} /></div>
            <p className="metric-foot">Demo baseline <b>31 kW</b></p>
          </article>

          <article className="metric-card fuel-card">
            <div className="metric-top"><span className="metric-icon fuel">◒</span><span className="metric-context">SUPPLY</span></div>
            <p className="metric-label">Fuel remaining</p>
            <div className="metric-value-row"><strong>{reading ? `${reading.energy.fuel_percent}` : '—'}<small>%</small></strong><span className={`trend ${isStorm ? 'trend-down' : ''}`}>{isStorm ? '↓ Decreasing' : 'Available'}</span></div>
            <div className="meter"><span className={isStorm ? 'meter-low' : ''} style={{ width: `${reading?.energy.fuel_percent ?? 0}%` }} /></div>
            <p className="metric-foot">Simulated station reserve</p>
          </article>
        </section>

        <section className={`alert-card ${alertLevel === 'warning' ? 'alert-warning' : ''}`} aria-live="polite">
          <div className="alert-symbol">{alertLevel === 'warning' ? '!' : '✓'}</div>
          <div className="alert-copy">
            <div className="alert-title-row"><span className="alert-kicker">SYSTEM ALERT</span><span className={`severity ${alertLevel}`}>{alertLevel.toUpperCase()}</span></div>
            <h3>{alertLevel === 'warning' ? 'Storm conditions affecting energy' : 'Station systems look steady'}</h3>
            <p>{reading?.alert?.reason ?? 'Loading the latest station status.'}</p>
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
            <button className={`button button-storm ${isStorm ? 'selected' : ''}`} onClick={() => chooseScenario('storm')} disabled={busy || isStorm}>
              <span aria-hidden="true">❄</span> {busy ? 'Updating…' : 'Start storm'}
            </button>
            <button className="button button-reset" onClick={() => chooseScenario('reset')} disabled={busy || !isStorm}>
              Reset to normal
            </button>
          </div>
        </section>

        <footer className="footer-note">
          <span className="footer-icon">i</span>
          <p><b>Prototype data notice</b><br />All readings are synthetic examples for demonstration. Thresholds are illustrative and are not operational guidance for Maitri or any Antarctic station.</p>
          <button className="refresh-button" onClick={refresh} aria-label="Refresh readings" title="Refresh readings">↻</button>
        </footer>
      </div>
    </main>
  );
}
