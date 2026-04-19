#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

include_jellyfin=0
enable_user_service=0
install_kiosk=0
skip_system_deps=0
skip_controller_profile=0
skip_uv_sync=0
service_name="superdeck.service"
port="${SUPERDECK_PORT:-8085}"

usage() {
  cat <<'EOF'
Usage: scripts/bootstrap-new-system.sh [options]

Bootstraps a fresh Linux system for SuperDeck from this repository checkout.

Options:
  --include-jellyfin           Install and enable Jellyfin too.
  --enable-user-service        Install and start a systemd user service.
  --install-kiosk              Install a desktop autostart kiosk launcher.
  --service-name NAME          User service name. Default: superdeck.service.
  --port PORT                  SuperDeck port for the service/kiosk. Default: 8085.
  --skip-system-deps           Do not install system packages.
  --skip-controller-profile    Do not install the antimicrox controller profile.
  --skip-uv-sync               Do not run uv sync.
  -h, --help                   Show this help.

Examples:
  scripts/bootstrap-new-system.sh
  scripts/bootstrap-new-system.sh --include-jellyfin --enable-user-service --install-kiosk

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --include-jellyfin)
      include_jellyfin=1
      shift
      ;;
    --enable-user-service)
      enable_user_service=1
      shift
      ;;
    --install-kiosk)
      install_kiosk=1
      shift
      ;;
    --service-name)
      service_name="${2:?--service-name requires a value}"
      shift 2
      ;;
    --port)
      port="${2:?--port requires a value}"
      shift 2
      ;;
    --skip-system-deps)
      skip_system_deps=1
      shift
      ;;
    --skip-controller-profile)
      skip_controller_profile=1
      shift
      ;;
    --skip-uv-sync)
      skip_uv_sync=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_uv() {
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi

  cat >&2 <<'EOF'

uv is required to install SuperDeck's Python dependencies.
Install it first, then rerun this script:

  curl -LsSf https://astral.sh/uv/install.sh | sh

EOF
  exit 1
}

install_system_deps() {
  if [[ "$skip_system_deps" -eq 1 ]]; then
    echo "Skipping system dependency install."
    return
  fi

  local args=()
  if [[ "$include_jellyfin" -eq 1 ]]; then
    args+=(--include-jellyfin)
  fi
  "$SCRIPT_DIR/install-system-deps.sh" "${args[@]}"
}

sync_python_env() {
  if [[ "$skip_uv_sync" -eq 1 ]]; then
    echo "Skipping uv sync."
    return
  fi

  require_uv
  (cd "$REPO_ROOT" && uv sync)
}

install_controller_profile() {
  if [[ "$skip_controller_profile" -eq 1 ]]; then
    echo "Skipping controller profile install."
    return
  fi

  "$SCRIPT_DIR/install-controller-profile.sh"
}

install_user_service() {
  local service_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
  local service_path="$service_dir/$service_name"
  mkdir -p "$service_dir"

  cat >"$service_path" <<EOF
[Unit]
Description=SuperDeck console shell
After=graphical-session.target network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO_ROOT
ExecStart=$REPO_ROOT/.venv/bin/python -m superdeck
Restart=on-failure
RestartSec=3
Environment=SUPERDECK_PORT=$port
Environment=SUPERDECK_CHROMIUM_PROFILE=/tmp/superdeck-chromium
Environment="SUPERDECK_RESTART_COMMAND=systemctl --user restart $service_name"

[Install]
WantedBy=default.target
EOF

  systemctl --user daemon-reload
  systemctl --user enable --now "$service_name"

  if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$USER" || true
  fi

  echo "Installed user service: $service_path"
}

first_chromium() {
  local candidate
  for candidate in chromium chromium-browser google-chrome google-chrome-stable brave-browser microsoft-edge; do
    if command -v "$candidate" >/dev/null 2>&1; then
      command -v "$candidate"
      return
    fi
  done
  echo chromium
}

install_kiosk_launcher() {
  local autostart_dir="${XDG_CONFIG_HOME:-$HOME/.config}/autostart"
  local desktop_path="$autostart_dir/superdeck-kiosk.desktop"
  local chromium_bin
  chromium_bin="$(first_chromium)"
  mkdir -p "$autostart_dir"

  cat >"$desktop_path" <<EOF
[Desktop Entry]
Type=Application
Name=SuperDeck Kiosk
Exec=$chromium_bin --kiosk --app=http://127.0.0.1:$port
X-GNOME-Autostart-enabled=true
EOF

  echo "Installed kiosk autostart: $desktop_path"
}

install_system_deps
sync_python_env
install_controller_profile

if [[ "$enable_user_service" -eq 1 ]]; then
  install_user_service
fi

if [[ "$install_kiosk" -eq 1 ]]; then
  install_kiosk_launcher
fi

cat <<EOF

SuperDeck bootstrap complete.

Run manually:
  cd "$REPO_ROOT"
  uv run superdeck

Open:
  http://127.0.0.1:$port

Diagnostics:
  curl http://127.0.0.1:$port/api/dependencies
  curl http://127.0.0.1:$port/api/session
  curl http://127.0.0.1:$port/api/diagnostics

EOF
