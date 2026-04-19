#!/usr/bin/env bash
set -euo pipefail

script_url="https://repo.jellyfin.org/install-debuntu.sh"
checksum_url="https://repo.jellyfin.org/install-debuntu.sh.sha256sum"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required to download the official Jellyfin installer." >&2
  echo "Install curl first, then rerun this script." >&2
  exit 1
fi

if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum is required to verify the official Jellyfin installer." >&2
  echo "Install coreutils first, then rerun this script." >&2
  exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
  cat >&2 <<'EOF'
This automatic Jellyfin installer currently supports Debian/Ubuntu derivatives.
For other Linux distributions, use Jellyfin's container or distro-specific
installation path.
EOF
  exit 1
fi

echo "Downloading the official Jellyfin Debian/Ubuntu installer..."
curl -fsSL "$script_url" -o "$workdir/install-debuntu.sh"
curl -fsSL "$checksum_url" -o "$workdir/install-debuntu.sh.sha256sum"

(
  cd "$workdir"
  sha256sum -c install-debuntu.sh.sha256sum
)

cat <<'EOF'

The Jellyfin installer checksum is valid.
Running the official Jellyfin installer with sudo.

EOF

sudo bash "$workdir/install-debuntu.sh"
sudo systemctl enable --now jellyfin

cat <<'EOF'

Jellyfin install command completed.
Open http://localhost:8096 to finish the Jellyfin setup wizard.

EOF
