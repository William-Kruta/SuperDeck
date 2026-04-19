#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_SRC="$SCRIPT_DIR/youtube-tv-controller.amgp"
PROFILE_DEST_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/antimicrox/profiles"
PROFILE_DEST="$PROFILE_DEST_DIR/youtube-tv-controller.amgp"

install_antimicrox() {
  if command -v antimicrox >/dev/null 2>&1; then
    return 0
  fi
  echo "antimicrox not found — installing..."
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get install -y antimicrox
  elif command -v dnf >/dev/null 2>&1; then
    sudo dnf install -y antimicrox
  elif command -v pacman >/dev/null 2>&1; then
    sudo pacman -Syu --needed antimicrox
  else
    cat >&2 <<'EOF'

antimicrox is not installed and no supported package manager was found.
Install it manually: https://github.com/antimicrox/antimicrox/releases
Then re-run this script.

EOF
    exit 1
  fi
}

install_antimicrox

mkdir -p "$PROFILE_DEST_DIR"
cp "$PROFILE_SRC" "$PROFILE_DEST"
echo "Profile installed to: $PROFILE_DEST"

cat <<EOF

One-time setup (takes ~30 seconds):

  1. Run: antimicrox
  2. Your Xbox controller will appear — click it.
  3. Click "Load Profile" → select "youtube-tv-controller".
  4. Right-click the controller → "Set as default profile" so it
     loads automatically every time antimicrox starts.
  5. In antimicrox → Preferences, enable "Start on Login" and
     "Start minimized to tray" so it runs silently at boot.

After that, the controller works in YouTube TV automatically.
No further setup needed for new users — just run this script.

EOF
