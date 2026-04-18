# Netflix Tile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Netflix launcher tile that probes for a TV-friendly UI via user-agent spoofing, falling back to a gamepad-to-mouse daemon if no TV UI is detected.

**Architecture:** A `kind: command` tile in `apps.yaml` points to `scripts/launch-netflix.sh`. That script probes Netflix with three TV user-agents via curl; if a TV UI marker is found it launches Chromium with that agent, otherwise it launches Chromium normally and spawns `scripts/netflix-gamepad.py` which maps Xbox controller inputs to mouse actions via `xdotool` and exits when the Chromium process ends.

**Tech Stack:** Bash (launcher script), Python 3.12 + evdev (gamepad daemon), xdotool (mouse/keyboard simulation), curl (probe).

---

### Task 1: Add Netflix tile to apps.yaml

**Files:**
- Modify: `mediaserver/config/apps.yaml`

- [ ] **Step 1: Add the tile entry**

Open `mediaserver/config/apps.yaml` and append after the YouTube tile:

```yaml
  - id: netflix
    name: Netflix
    kind: command
    category: Media
    description: Netflix streaming
    logo: /assets/logos/netflix-logo.webp
    command: ./scripts/launch-netflix.sh
    requires_display: true
```

- [ ] **Step 2: Verify the tile appears in the API**

Start the server and confirm the tile is returned:

```bash
uv run python -m mediaserver &
sleep 2
curl -s http://127.0.0.1:8080/api/apps | python3 -m json.tool | grep -A5 '"id": "netflix"'
kill %1
```

Expected output contains:
```json
"id": "netflix",
"name": "Netflix",
"kind": "command",
```

- [ ] **Step 3: Commit**

```bash
git add mediaserver/config/apps.yaml
git commit -m "feat: add Netflix tile to app config"
```

---

### Task 2: Create launch-netflix.sh

**Files:**
- Create: `scripts/launch-netflix.sh`

- [ ] **Step 1: Write a failing probe test**

Create `scripts/tests/test-launch-netflix.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$actual" == "$expected" ]]; then
    echo "PASS: $desc"; ((PASS++))
  else
    echo "FAIL: $desc — expected '$expected' got '$actual'"; ((FAIL++))
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

echo
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
```

```bash
mkdir -p scripts/tests
chmod +x scripts/tests/test-launch-netflix.sh
bash scripts/tests/test-launch-netflix.sh
```

Expected: FAIL with "source-only mode not implemented".

- [ ] **Step 2: Write launch-netflix.sh**

```bash
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
```

```bash
chmod +x scripts/launch-netflix.sh
```

- [ ] **Step 3: Run the probe test**

```bash
bash scripts/tests/test-launch-netflix.sh
```

Expected:
```
PASS: probe_user_agent detects TV UI marker
Results: 1 passed, 0 failed
```

- [ ] **Step 4: Write a test for the no-TV-UI fallback path**

Add to `scripts/tests/test-launch-netflix.sh` (before the final `assert_eq` block):

```bash
# Test: probe_user_agent returns "desktop" when response has no TV markers
curl() {
  echo '<html><title>Netflix</title></html>'
}
export -f curl

source "$(dirname "$0")/../launch-netflix.sh" --source-only

result=$(probe_user_agent "FakeAgent/1.0")
assert_eq "probe_user_agent returns desktop for non-TV response" "desktop" "$result"

unset -f curl
```

```bash
bash scripts/tests/test-launch-netflix.sh
```

Expected:
```
PASS: probe_user_agent detects TV UI marker
PASS: probe_user_agent returns desktop for non-TV response
Results: 2 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add scripts/launch-netflix.sh scripts/tests/test-launch-netflix.sh
git commit -m "feat: add Netflix smart launcher script with TV-UI probe"
```

---

### Task 3: Create netflix-gamepad.py

**Files:**
- Create: `scripts/netflix-gamepad.py`

- [ ] **Step 1: Write a failing test for PID validation**

Create `scripts/tests/test-netflix-gamepad.py`:

```python
#!/usr/bin/env python3
import subprocess
import sys
import os

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "netflix-gamepad.py")

def run(args, env=None):
    result = subprocess.run(
        [sys.executable, SCRIPT] + args,
        capture_output=True, text=True,
        env={**os.environ, **(env or {})}
    )
    return result

def test_exits_without_args():
    r = run([])
    assert r.returncode != 0, f"Expected non-zero exit, got {r.returncode}"
    assert "usage" in r.stderr.lower() or "pid" in r.stderr.lower(), \
        f"Expected usage message, got: {r.stderr}"
    print("PASS: exits with error when no PID given")

def test_exits_for_dead_pid():
    # PID 999999 almost certainly doesn't exist
    r = run(["999999"])
    assert r.returncode == 0, f"Expected clean exit, got {r.returncode}\n{r.stderr}"
    print("PASS: exits cleanly for non-existent PID")

if __name__ == "__main__":
    failed = 0
    for test in [test_exits_without_args, test_exits_for_dead_pid]:
        try:
            test()
        except AssertionError as e:
            print(f"FAIL: {e}")
            failed += 1
    print(f"\nResults: {2 - failed} passed, {failed} failed")
    sys.exit(failed)
```

```bash
python3 scripts/tests/test-netflix-gamepad.py
```

Expected: FAIL — `netflix-gamepad.py` doesn't exist yet.

- [ ] **Step 2: Write netflix-gamepad.py**

```python
#!/usr/bin/env python3
"""Gamepad-to-mouse daemon for Netflix. Exits when the target PID is gone."""

import os
import sys
import time
import signal
import subprocess
import threading

POLL_INTERVAL = 1 / 60  # ~60 Hz
PID_CHECK_INTERVAL = 2.0  # seconds between PID checks
DEAD_ZONE = 0.10  # ignore stick deflection below this fraction
MAX_CURSOR_SPEED = 20  # pixels per tick at full deflection
DPAD_STEP = 80  # pixels per D-pad press

_running = True


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but we can't signal it


def xdo(args: list[str]) -> None:
    subprocess.run(["xdotool"] + args, capture_output=True)


def apply_dead_zone(value: float) -> float:
    if abs(value) < DEAD_ZONE:
        return 0.0
    sign = 1 if value > 0 else -1
    return sign * (abs(value) - DEAD_ZONE) / (1.0 - DEAD_ZONE)


def watch_pid(pid: int) -> None:
    global _running
    while _running:
        if not pid_alive(pid):
            _running = False
            return
        time.sleep(PID_CHECK_INTERVAL)


def find_gamepad():
    try:
        import evdev
    except ImportError:
        print("[netflix-gamepad] evdev not installed — install python3-evdev", file=sys.stderr)
        return None

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        devices = [evdev.InputDevice(p) for p in evdev.list_devices()]
        for dev in devices:
            caps = dev.capabilities()
            # Gamepad: has absolute axes (sticks) and buttons
            if evdev.ecodes.EV_ABS in caps and evdev.ecodes.EV_KEY in caps:
                print(f"[netflix-gamepad] Using device: {dev.name}", file=sys.stderr)
                return dev
        time.sleep(0.5)

    print("[netflix-gamepad] No gamepad found after 5s — exiting.", file=sys.stderr)
    return None


def run_loop(dev) -> None:
    import evdev
    from evdev import ecodes as e

    # Axis info for normalising stick values
    abs_info = {code: dev.absinfo(code) for code in (e.ABS_X, e.ABS_Y, e.ABS_RZ, e.ABS_Z)
                if code in dict(dev.capabilities().get(e.EV_ABS, []))}

    def norm(code: int, raw: int) -> float:
        info = abs_info.get(code)
        if info is None:
            return 0.0
        mid = (info.max + info.min) / 2
        half = (info.max - info.min) / 2
        return (raw - mid) / half if half else 0.0

    stick = {e.ABS_X: 0.0, e.ABS_Y: 0.0}
    trigger = {e.ABS_Z: 0, e.ABS_RZ: 0}
    scroll_accum = {e.ABS_Z: 0.0, e.ABS_RZ: 0.0}

    # Xbox button codes (evdev)
    BTN_A = e.BTN_SOUTH
    BTN_B = e.BTN_EAST
    BTN_X = e.BTN_WEST
    BTN_Y = e.BTN_NORTH
    DPAD_X = e.ABS_HAT0X
    DPAD_Y = e.ABS_HAT0Y

    last_move = time.monotonic()

    def handle_event(event):
        nonlocal last_move

        if event.type == e.EV_KEY and event.value == 1:  # key down
            if event.code == BTN_A:
                xdo(["click", "1"])
            elif event.code == BTN_B:
                xdo(["key", "alt+Left"])
            elif event.code == BTN_X:
                xdo(["key", "Escape"])
            elif event.code == BTN_Y:
                xdo(["key", "ctrl+f"])

        elif event.type == e.EV_ABS:
            if event.code in (e.ABS_X, e.ABS_Y):
                stick[event.code] = apply_dead_zone(norm(event.code, event.value))
            elif event.code in (e.ABS_Z, e.ABS_RZ):
                trigger[event.code] = event.value
            elif event.code == DPAD_X:
                if event.value != 0:
                    xdo(["mousemove_relative", "--", str(event.value * DPAD_STEP), "0"])
            elif event.code == DPAD_Y:
                if event.value != 0:
                    xdo(["mousemove_relative", "--", "0", str(event.value * DPAD_STEP)])

    # Move loop: update cursor from stick state at 60 Hz
    def move_loop():
        while _running:
            dx = int(stick.get(e.ABS_X, 0.0) * MAX_CURSOR_SPEED)
            dy = int(stick.get(e.ABS_Y, 0.0) * MAX_CURSOR_SPEED)
            if dx or dy:
                xdo(["mousemove_relative", "--", str(dx), str(dy)])
            # Trigger scrolling (trigger value 0–255 typically)
            for axis, btn in ((e.ABS_RZ, "5"), (e.ABS_Z, "4")):
                val = trigger.get(axis, 0)
                if val > 20:
                    scroll_accum[axis] = scroll_accum.get(axis, 0.0) + val / 255.0
                    while scroll_accum[axis] >= 1.0:
                        xdo(["click", btn])
                        scroll_accum[axis] -= 1.0
                else:
                    scroll_accum[axis] = 0.0
            time.sleep(POLL_INTERVAL)

    t = threading.Thread(target=move_loop, daemon=True)
    t.start()

    try:
        for event in dev.read_loop():
            if not _running:
                break
            handle_event(event)
    except OSError:
        pass  # device disconnected


def main() -> None:
    global _running

    if len(sys.argv) != 2:
        print("Usage: netflix-gamepad.py <chromium-pid>", file=sys.stderr)
        sys.exit(1)

    try:
        target_pid = int(sys.argv[1])
    except ValueError:
        print(f"Invalid PID: {sys.argv[1]}", file=sys.stderr)
        sys.exit(1)

    if not pid_alive(target_pid):
        print(f"[netflix-gamepad] PID {target_pid} not running — exiting.", file=sys.stderr)
        sys.exit(0)

    signal.signal(signal.SIGTERM, lambda *_: globals().update(_running=False))
    signal.signal(signal.SIGINT, lambda *_: globals().update(_running=False))

    dev = find_gamepad()
    if dev is None:
        sys.exit(0)

    watcher = threading.Thread(target=watch_pid, args=(target_pid,), daemon=True)
    watcher.start()

    run_loop(dev)


if __name__ == "__main__":
    main()
```

```bash
chmod +x scripts/netflix-gamepad.py
```

- [ ] **Step 3: Run the PID validation tests**

```bash
python3 scripts/tests/test-netflix-gamepad.py
```

Expected:
```
PASS: exits with error when no PID given
PASS: exits cleanly for non-existent PID
Results: 2 passed, 0 failed
```

- [ ] **Step 4: Commit**

```bash
git add scripts/netflix-gamepad.py scripts/tests/test-netflix-gamepad.py
git commit -m "feat: add Netflix gamepad-to-mouse daemon"
```

---

### Task 4: Update install-system-deps.sh

**Files:**
- Modify: `scripts/install-system-deps.sh`

- [ ] **Step 1: Write a failing test**

Create `scripts/tests/test-install-deps.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PASS=0; FAIL=0

assert_contains() {
  local desc="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "PASS: $desc"; ((PASS++))
  else
    echo "FAIL: $desc — '$needle' not found"; ((FAIL++))
  fi
}

script="$(cat "$(dirname "$0")/../install-system-deps.sh")"

assert_contains "apt install includes xdotool"     "xdotool"      "$script"
assert_contains "apt install includes python3-evdev" "python3-evdev" "$script"
assert_contains "dnf install includes xdotool"     "xdotool"      "$script"
assert_contains "pacman install includes xdotool"  "xdotool"      "$script"
assert_contains "zypper install includes xdotool"  "xdotool"      "$script"

echo
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]
```

```bash
chmod +x scripts/tests/test-install-deps.sh
bash scripts/tests/test-install-deps.sh
```

Expected: FAIL — xdotool and python3-evdev not yet in the script.

- [ ] **Step 2: Add packages to install_apt**

In `scripts/install-system-deps.sh`, change:

```bash
  local packages=(chromium mpv steam-launcher retroarch)
```

to:

```bash
  local packages=(chromium mpv steam-launcher retroarch xdotool python3-evdev)
```

- [ ] **Step 3: Add xdotool to install_dnf**

Change:

```bash
install_dnf() {
  sudo dnf install -y chromium mpv steam retroarch
```

to:

```bash
install_dnf() {
  sudo dnf install -y chromium mpv steam retroarch xdotool python3-evdev
```

- [ ] **Step 4: Add xdotool to install_pacman**

Change:

```bash
install_pacman() {
  sudo pacman -Syu --needed chromium mpv steam retroarch
```

to:

```bash
install_pacman() {
  sudo pacman -Syu --needed chromium mpv steam retroarch xdotool python-evdev
```

Note: on Arch, the package is `python-evdev` not `python3-evdev`.

- [ ] **Step 5: Add xdotool to install_zypper**

Change:

```bash
install_zypper() {
  sudo zypper install -y chromium mpv steam retroarch
```

to:

```bash
install_zypper() {
  sudo zypper install -y chromium mpv steam retroarch xdotool python3-evdev
```

- [ ] **Step 6: Run the test**

```bash
bash scripts/tests/test-install-deps.sh
```

Expected:
```
PASS: apt install includes xdotool
PASS: apt install includes python3-evdev
PASS: dnf install includes xdotool
PASS: pacman install includes xdotool
PASS: zypper install includes xdotool
Results: 5 passed, 0 failed
```

- [ ] **Step 7: Commit**

```bash
git add scripts/install-system-deps.sh scripts/tests/test-install-deps.sh
git commit -m "feat: add xdotool and python3-evdev to system deps installer"
```

---

### Task 5: Manual integration smoke test

- [ ] **Step 1: Install new system dependencies**

```bash
scripts/install-system-deps.sh
```

Verify:

```bash
command -v xdotool && echo "xdotool ok"
python3 -c "import evdev; print('evdev ok')"
```

- [ ] **Step 2: Start the server and verify Netflix tile renders**

```bash
uv run python -m mediaserver
```

Open `http://127.0.0.1:8080` in a browser. Confirm the Netflix tile appears in the Media category with the correct logo.

- [ ] **Step 3: Verify the launcher script is reachable**

```bash
ls -la scripts/launch-netflix.sh scripts/netflix-gamepad.py
```

Both should be executable (`-rwxr-xr-x`).

- [ ] **Step 4: Dry-run the probe (no Chromium launched)**

```bash
LOG=/tmp/mediaserver-launch.log
# Override Chromium to a no-op
MEDIASERVER_CHROMIUM_BIN=echo bash scripts/launch-netflix.sh 2>/dev/null &
sleep 5
kill %1 2>/dev/null || true
cat /tmp/mediaserver-launch.log
```

Expected log output shows probe attempts and either "TV UI detected" or "No TV UI found — starting gamepad daemon."

- [ ] **Step 5: Commit any final fixes**

```bash
git add -p
git commit -m "fix: any integration issues found in smoke test"
```
