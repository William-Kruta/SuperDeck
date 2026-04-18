#!/usr/bin/env bash
set -euo pipefail

LOG=/tmp/mediaserver-launch.log
NETFLIX_URL="https://www.netflix.com"

CHROMIUM_BIN="${MEDIASERVER_CHROMIUM_BIN:-chromium}"
CHROMIUM_PROFILE="${MEDIASERVER_CHROMIUM_PROFILE:-/tmp/mediaserver-chromium}"
CHROMIUM_EXTRA_ARGS="${MEDIASERVER_CHROMIUM_ARGS:-}"

TV_AGENTS=(
  "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 TV Safari/538.1"
  "Mozilla/5.0 (WebAppManager) webOS/2.0.0 AppleWebKit/538.1 (KHTML, like Gecko) webOSBrowser/1.0 Safari/538.1"
  "Mozilla/5.0 (Linux; Android 9; AFTT Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/67.0.3396.87 Mobile Safari/537.36"
)

# Allow sourcing for tests without executing main logic
if [[ "${1:-}" == "--source-only" ]]; then
  probe_user_agent() {
    local agent="$1"
    local body
    body=$(curl -s --max-time 3 -A "$agent" "$NETFLIX_URL" 2>>"$LOG" || true)
    if echo "$body" | grep -qE '"uiType":"tv"|lolomo'; then
      echo "tv"
    else
      echo "desktop"
    fi
  }
  return 0 2>/dev/null || exit 0
fi

probe_user_agent() {
  local agent="$1"
  local body
  body=$(curl -s --max-time 3 -A "$agent" "$NETFLIX_URL" 2>>"$LOG" || true)
  if echo "$body" | grep -qE '"uiType":"tv"|lolomo'; then
    echo "tv"
  else
    echo "desktop"
  fi
}

launch_chromium() {
  local agent="${1:-}"
  local args=(
    --new-window
    --start-fullscreen
    "--user-data-dir=${CHROMIUM_PROFILE}"
    --app="$NETFLIX_URL"
  )
  [[ -n "$agent" ]] && args+=("--user-agent=${agent}")
  # shellcheck disable=SC2086
  [[ -n "$CHROMIUM_EXTRA_ARGS" ]] && args+=($CHROMIUM_EXTRA_ARGS)
  "$CHROMIUM_BIN" "${args[@]}" &
  echo $!
}

main() {
  echo "[netflix] Starting launcher at $(date)" >>"$LOG"

  local selected_agent=""
  for agent in "${TV_AGENTS[@]}"; do
    echo "[netflix] Probing with: ${agent:0:40}..." >>"$LOG"
    result=$(probe_user_agent "$agent")
    if [[ "$result" == "tv" ]]; then
      selected_agent="$agent"
      echo "[netflix] TV UI detected." >>"$LOG"
      break
    fi
  done

  local chromium_pid
  chromium_pid=$(launch_chromium "$selected_agent")
  echo "[netflix] Chromium PID: $chromium_pid" >>"$LOG"

  if [[ -z "$selected_agent" ]]; then
    echo "[netflix] No TV UI found — starting gamepad daemon." >>"$LOG"
    local script_dir
    script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
    if command -v xdotool >/dev/null 2>&1; then
      python3 "${script_dir}/netflix-gamepad.py" "$chromium_pid" >>"$LOG" 2>&1 &
    else
      echo "[netflix] xdotool not found — gamepad mouse mode unavailable." >>"$LOG"
    fi
  fi

  wait "$chromium_pid" 2>/dev/null || true
}

main
