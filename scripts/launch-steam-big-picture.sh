#!/usr/bin/env bash
set -euo pipefail

steam_bin="${STEAM_BIN:-steam}"
mode="${STEAM_BIG_PICTURE_MODE:-protocol}"

shutdown_steam() {
  "$steam_bin" -shutdown >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if ! pgrep -u "$(id -u)" -x steam >/dev/null 2>&1; then
      break
    fi
    sleep 0.5
  done
}

case "$mode" in
  protocol)
    "$steam_bin" >/dev/null 2>&1 &
    sleep "${STEAM_BIG_PICTURE_DELAY:-4}"
    exec "$steam_bin" steam://open/bigpicture
    ;;
  tenfoot)
    shutdown_steam
    exec "$steam_bin" -tenfoot -cef-force-gpu
    ;;
  cef-workaround)
    shutdown_steam
    exec "$steam_bin" -tenfoot -cef-force-gpu -no-cef-sandbox
    ;;
  *)
    echo "Unknown STEAM_BIG_PICTURE_MODE: $mode" >&2
    echo "Expected one of: protocol, tenfoot, cef-workaround" >&2
    exit 2
    ;;
esac
