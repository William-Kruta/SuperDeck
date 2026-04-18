#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $desc"; ((PASS++)) || true
  else
    echo "FAIL: $desc — expected '$expected' got '$actual'"; ((FAIL++)) || true
  fi
}

# Test: probe_user_agent returns "tv" when curl response contains lolomo
curl() {
  # Simulate a TV UI response
  echo '"lolomo"'
}
export -f curl

source "$(dirname "$0")/../launch-netflix.sh" --source-only

result=$(probe_user_agent "FakeAgent/1.0")
assert_eq "probe_user_agent detects TV UI marker" "tv" "$result"

unset -f curl

# Test: probe_user_agent returns "desktop" when response has no TV markers
curl() {
  echo '<html><title>Netflix</title></html>'
}
export -f curl

source "$(dirname "$0")/../launch-netflix.sh" --source-only

result=$(probe_user_agent "FakeAgent/1.0")
assert_eq "probe_user_agent returns desktop for non-TV response" "desktop" "$result"

unset -f curl

echo
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
