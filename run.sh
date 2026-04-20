#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HOST="${SUPERDECK_HOST:-127.0.0.1}"
PORT="${SUPERDECK_PORT:-8085}"
URL="http://${HOST}:${PORT}"
UI_PROFILE="${SUPERDECK_UI_BROWSER_PROFILE:-/tmp/superdeck-ui-browser}"

browser_bin() {
  if [[ -n "${SUPERDECK_BROWSER_BIN:-}" ]]; then
    command -v "$SUPERDECK_BROWSER_BIN"
    return
  fi

  local candidate
  for candidate in chromium chromium-browser google-chrome google-chrome-stable brave-browser brave-browser-stable brave microsoft-edge; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done

  return 1
}

wait_for_server() {
  local deadline=$((SECONDS + 20))
  until curl -fsS "${URL}/api/health" >/dev/null 2>&1; do
    if (( SECONDS >= deadline )); then
      echo "Timed out waiting for SuperDeck at ${URL}" >&2
      return 1
    fi
    sleep 0.25
  done

  curl -fsS "$URL/" >/dev/null 2>&1 || true
}

cleanup() {
  if [[ -n "${server_pid:-}" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

source .venv/bin/activate
uv run python -m superdeck --host "$HOST" --port "$PORT" &
server_pid=$!

wait_for_server

browser="$(browser_bin)" || {
  echo "No Chromium-compatible browser found. Open ${URL} manually." >&2
  wait "$server_pid"
}

"$browser" \
  --new-window \
  --start-fullscreen \
  --user-data-dir="$UI_PROFILE" \
  --no-first-run \
  --disable-session-crashed-bubble \
  "$URL" \
  ${SUPERDECK_BROWSER_ARGS:-} &

wait "$server_pid"
