/**
 * Tabler Icons set (consistent 1.75 stroke on a 24x24 grid).
 * Coherent, lightweight, accessible icon primitives.
 */
const paths = {
  // Navigation & Radar
  radar: (
    <>
      <path d="M21 12h-8a1 1 0 1 0 -1 1v8a9 9 0 0 0 9 -9" />
      <path d="M16 9a5 5 0 1 0 -7 7" />
      <path d="M20.486 9a9 9 0 1 0 -11.482 11.495" />
    </>
  ),

  // Environment & Weather
  snowflake: (
    <>
      <path d="M12 3v18" />
      <path d="M3 12h18" />
      <path d="M6 6l12 12" />
      <path d="M6 18l12 -12" />
      <path d="M10 4l2 2l2 -2" />
      <path d="M10 20l2 -2l2 2" />
      <path d="M4 10l2 2l-2 2" />
      <path d="M20 10l-2 2l2 2" />
    </>
  ),
  cloudSnow: (
    <>
      <path d="M7 18a4.6 4.4 0 0 1 0 -9a5 4.5 0 0 1 11 2h1a3.5 3.5 0 0 1 0 7h-12" />
      <path d="M11 15v.01" />
      <path d="M15 15v.01" />
      <path d="M9 18v.01" />
      <path d="M13 18v.01" />
      <path d="M11 21v.01" />
    </>
  ),

  // Energy & Thermal
  flame: (
    <path d="M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -.612 -3.076 -1.6 -4.2c-.4 1.2 -1.4 2.2 -2.4 2.2z" />
  ),
  bolt: (
    <path d="M13 3l-2 8h6l-4 10l2 -8h-6l4 -10z" />
  ),

  // Supply & Fuel
  fuel: (
    <>
      <path d="M14 11h1a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0v-7l-3 -3" />
      <path d="M4 20v-14a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v14" />
      <path d="M3 20l12 0" />
      <path d="M18 7v1a1 1 0 0 0 1 1h1" />
      <path d="M4 11l10 0" />
    </>
  ),
  drop: (
    <path d="M6.8 11a6 6 0 1 0 10.396 0l-5.196 -8l-5.2 8z" />
  ),

  // Alerts & Verification
  shieldCheck: (
    <>
      <path d="M9 12l2 2l4 -4" />
      <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
    </>
  ),
  alertCritical: (
    <>
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
      <path d="M9.172 3h5.656a2 2 0 0 1 1.414 .586l4.172 4.172a2 2 0 0 1 .586 1.414v5.656a2 2 0 0 1 -.586 1.414l-4.172 4.172a2 2 0 0 1 -1.414 .586h-5.656a2 2 0 0 1 -1.414 -.586l-4.172 -4.172a2 2 0 0 1 -.586 -1.414v-5.656a2 2 0 0 1 .586 -1.414l4.172 -4.172a2 2 0 0 1 1.414 -.586z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M5 19h14a2 2 0 0 0 1.84 -2.75l-7.1 -12.25a2 2 0 0 0 -3.5 0l-7.1 12.25a2 2 0 0 0 1.75 2.75" />
    </>
  ),
  check: (
    <path d="M5 12l5 5l10 -10" />
  ),

  // Health & Bio
  pulse: (
    <path d="M3 12h4l3 8l4 -16l3 8h4" />
  ),
  heartbeat: (
    <path d="M19.5 12.572l-7.5 7.428l-7.5 -7.428a5 5 0 1 1 7.5 -6.566a5 5 0 1 1 7.5 6.572" />
  ),

  // Logistics & Shipment
  truck: (
    <>
      <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      <path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />
    </>
  ),
  package: (
    <>
      <path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" />
      <path d="M12 12l8 -4.5" />
      <path d="M12 12l0 9" />
      <path d="M12 12l-8 -4.5" />
      <path d="M16 5.25l-8 4.5" />
    </>
  ),

  // Connectivity & Telemetry
  wifi: (
    <>
      <path d="M12 18l.01 0" />
      <path d="M9.172 15.172a4 4 0 0 1 5.656 0" />
      <path d="M6.343 12.343a8 8 0 0 1 11.314 0" />
      <path d="M3.515 9.515c4.686 -4.687 12.284 -4.687 17 0" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M12 18l.01 0" />
      <path d="M9.172 15.172a4 4 0 0 1 5.656 0" />
      <path d="M6.343 12.343a7.963 7.963 0 0 1 3.864 -2.14m4.163 -.155a7.965 7.965 0 0 1 3.287 2.295" />
      <path d="M3.515 9.515a12 12 0 0 1 3.544 -2.455m3.171 -1.166a12.012 12.012 0 0 1 10.285 3.621" />
    </>
  ),

  // Actions & Reports
  fileCsv: (
    <>
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M5 12v-7a2 2 0 0 1 2 -2h7l5 5v4" />
      <path d="M7 16.5a1.5 1.5 0 0 0 -3 0v3a1.5 1.5 0 0 0 3 0" />
      <path d="M10 20.25c0 .414 .336 .75 .75 .75h1.25a1 1 0 0 0 1 -1v-1a1 1 0 0 0 -1 -1h-1a1 1 0 0 1 -1 -1v-1a1 1 0 0 1 1 -1h1.25a.75 .75 0 0 1 .75 .75" />
      <path d="M16 15l2 6l2 -6" />
    </>
  ),
  printer: (
    <>
      <path d="M17 17h2a2 2 0 0 0 2 -2v-4a2 2 0 0 0 -2 -2h-14a2 2 0 0 0 -2 2v4a2 2 0 0 0 2 2h2" />
      <path d="M17 9v-4a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v4" />
      <path d="M7 13m0 2a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v4a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
      <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
    </>
  ),
  info: (
    <>
      <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
      <path d="M12 9h.01" />
      <path d="M11 12h1v4h1" />
    </>
  ),
};

// Aliases for compatibility
paths.download = paths.fileCsv;
paths.file = paths.printer;
paths.box = paths.package;
paths.activity = paths.pulse;

export default function Icon({ name, size = 18, strokeWidth = 1.75, className = '', ...props }) {
  return (
    <svg
      aria-hidden="true"
      className={`ui-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...props}
    >
      {paths[name] ?? paths.activity}
    </svg>
  );
}
