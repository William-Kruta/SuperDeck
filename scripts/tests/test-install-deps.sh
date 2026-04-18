#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "PASS: $desc"; ((PASS++)) || true
  else
    echo "FAIL: $desc — '$needle' not found"; ((FAIL++)) || true
  fi
}

script="$(cat "$(dirname "$0")/../install-system-deps.sh")"

assert_contains "apt install includes xdotool"      "xdotool"       "$script"
assert_contains "apt install includes python3-evdev" "python3-evdev" "$script"
assert_contains "dnf install includes xdotool"      "xdotool"       "$script"
assert_contains "pacman install includes xdotool"   "xdotool"       "$script"
assert_contains "pacman install includes python-evdev" "python-evdev" "$script"
assert_contains "zypper install includes xdotool"   "xdotool"       "$script"

echo
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
