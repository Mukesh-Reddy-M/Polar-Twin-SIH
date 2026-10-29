#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/services/api"
WEB_DIR="$ROOT_DIR/apps/web"
PYTHON_BIN="${PYTHON_BIN:-python3}"
VENV_PYTHON="$API_DIR/.venv/bin/python"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3.9+ is required. Install Python, then rerun this script." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 20.19+ or 22.12+ and npm are required. Install a supported Node.js version, then rerun this script." >&2
  exit 1
fi

"$PYTHON_BIN" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)' || {
  echo "Python 3.9 or newer is required." >&2
  exit 1
}
node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 20 && minor >= 19) || (major >= 22 && (major !== 22 || minor >= 12)) ? 0 : 1)' || {
  echo "Vite requires Node.js 20.19+ or 22.12+." >&2
  exit 1
}

if [[ ! -x "$VENV_PYTHON" ]]; then
  "$PYTHON_BIN" -m venv "$API_DIR/.venv"
fi
"$VENV_PYTHON" -m pip install -r "$API_DIR/requirements-dev.txt"

if [[ ! -x "$WEB_DIR/node_modules/.bin/vite" ]]; then
  (cd "$WEB_DIR" && npm ci)
fi

cleanup() {
  if [[ -n "${API_PID:-}" ]]; then kill "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then kill "$WEB_PID" 2>/dev/null || true; fi
  if [[ -n "${API_PID:-}" ]]; then wait "$API_PID" 2>/dev/null || true; fi
  if [[ -n "${WEB_PID:-}" ]]; then wait "$WEB_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

(cd "$API_DIR" && exec "$VENV_PYTHON" -m uvicorn polar_twin.main:app --reload --host 127.0.0.1 --port 8000) &
API_PID=$!
(cd "$WEB_DIR" && exec node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173) &
WEB_PID=$!

echo "Polar Twin is starting. Web dashboard: http://localhost:5173"
echo "API and interactive docs: http://localhost:8000 and http://localhost:8000/docs"
echo "Press Ctrl+C to stop both services."

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 1
done
echo "A Polar Twin service stopped; shutting down the other service." >&2
exit 1
