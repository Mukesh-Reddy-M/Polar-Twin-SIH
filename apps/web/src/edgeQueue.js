const STORAGE_KEY = 'polar-twin-edge-queue-v1';

export function loadQueuedReadings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function saveQueuedReadings(readings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
}

export async function prepareBatch(readings) {
  const json = JSON.stringify(readings);
  const rawBytes = new TextEncoder().encode(json).byteLength;

  if (typeof CompressionStream === 'undefined') {
    return { body: json, compressed: false, rawBytes };
  }

  const stream = new Blob([json], { type: 'application/json' })
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const body = await new Response(stream).arrayBuffer();
  return { body, compressed: true, rawBytes };
}
