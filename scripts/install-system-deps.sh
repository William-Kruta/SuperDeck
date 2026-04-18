#!/usr/bin/env bash
set -euo pipefail

skip_apt_update=0
ignore_apt_update_errors=0
include_jellyfin=0

usage() {
  cat <<'EOF'
Usage: scripts/install-system-deps.sh [options]

Options:
  --skip-apt-update            Do not run apt-get update before installing.
  --ignore-apt-update-errors   Continue installing if apt-get update fails.
  --include-jellyfin           Also install and start Jellyfin server.
  -h, --help                   Show this help.

EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-apt-update)
      skip_apt_update=1
      shift
      ;;
    --ignore-apt-update-errors)
      ignore_apt_update_errors=1
      shift
      ;;
    --include-jellyfin)
      include_jellyfin=1
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

install_apt() {
  local packages=(chromium mpv steam-launcher retroarch xdotool python3-evdev)

  if [[ "$skip_apt_update" -eq 1 ]]; then
    echo "Skipping apt-get update. Installing from the current apt package cache."
  elif ! sudo apt-get update; then
    if [[ "$ignore_apt_update_errors" -eq 1 ]]; then
      cat >&2 <<'EOF'

apt-get update failed, but --ignore-apt-update-errors was provided.
Continuing with the current apt package cache.

EOF
    else
    cat >&2 <<'EOF'

apt-get update failed, so packages were not installed.

Fix the apt repository error above first. A common cause is a third-party repo
with a missing signing key. In that case either add the repo key, disable that
repo temporarily, or install packages manually, for example:

  sudo apt-get install mpv retroarch chromium steam-launcher

EOF
    exit 1
    fi
  fi

  sudo apt-get install -y "${packages[@]}"
}

install_dnf() {
  sudo dnf install -y chromium mpv steam retroarch xdotool python3-evdev
}

install_pacman() {
  sudo pacman -Syu --needed chromium mpv steam retroarch xdotool python-evdev
}

install_zypper() {
  sudo zypper install -y chromium mpv steam retroarch xdotool python3-evdev
}

if command -v apt-get >/dev/null 2>&1; then
  install_apt
elif command -v dnf >/dev/null 2>&1; then
  install_dnf
elif command -v pacman >/dev/null 2>&1; then
  install_pacman
elif command -v zypper >/dev/null 2>&1; then
  install_zypper
else
  echo "No supported package manager found." >&2
  echo "Install these packages manually: chromium mpv steam retroarch" >&2
  exit 1
fi

echo
echo "System dependency install command completed."
if [[ "$include_jellyfin" -eq 1 ]]; then
  "$(dirname "$0")/install-jellyfin.sh"
fi
echo "Restart MediaServer, then check: curl http://127.0.0.1:8080/api/dependencies"
