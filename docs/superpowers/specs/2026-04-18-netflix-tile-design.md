# Netflix Tile — Design Spec

**Date:** 2026-04-18
**Status:** Approved

## Overview

Add a Netflix tile to the SuperDeck launcher that opens Netflix in a controller-friendly way. The tile uses a smart launcher script that first probes for a TV-optimized Netflix UI via user-agent spoofing, then falls back to a gamepad-to-mouse daemon if no TV UI is found.

## Architecture

Three new files plus one config change:

```
apps.yaml                       ← add Netflix tile (kind: command)
scripts/launch-netflix.sh       ← smart launcher script
scripts/netflix-gamepad.py      ← gamepad-to-mouse daemon
```

`install-system-deps.sh` gains two new packages: `xdotool` and `python3-evdev`.

## apps.yaml Entry

```yaml
- id: netflix
  name: Netflix
  kind: command
  category: Media
  description: Netflix streaming
  logo: /assets/logos/netflix-logo.png
  command: ./scripts/launch-netflix.sh
  requires_display: true
```

## Launcher Script (`scripts/launch-netflix.sh`)

### Flow

1. Check that `xdotool` is installed; if not, log a warning to `/tmp/mediaserver-launch.log` and skip to step 3 without the daemon.
2. Probe `https://www.netflix.com` with each TV user-agent in priority order using `curl -s --max-time 3`. Grep response HTML for `"uiType":"tv"` or `lolomo` — markers present in Netflix's TV interface HTML but absent from the desktop version.
3. **If a TV user-agent matches:** launch Chromium with that user-agent, fullscreen, no toolbar — no daemon needed.
4. **If no match:** launch Chromium normally (default desktop user-agent), then spawn `scripts/netflix-gamepad.py <chromium_pid>` as a background process.

### TV User-Agent Probe Order

1. Samsung Tizen 5: `Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/5.0 TV Safari/538.1`
2. LG WebOS 4: `Mozilla/5.0 (WebAppManager) webOS/2.0.0 AppleWebKit/538.1 (KHTML, like Gecko) webOSBrowser/1.0 Safari/538.1`
3. Android TV: `Mozilla/5.0 (Linux; Android 9; AFTT Build/PS7233; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/67.0.3396.87 Mobile Safari/537.36`

### Chromium Launch

```bash
chromium \
  --new-window \
  --start-fullscreen \
  --user-data-dir=/tmp/mediaserver-chromium \
  [--user-agent="<tv-agent>"]  # only if TV probe succeeded \
  --app=https://www.netflix.com
```

Respects the `MEDIASERVER_CHROMIUM_BIN`, `MEDIASERVER_CHROMIUM_PROFILE`, and `MEDIASERVER_CHROMIUM_ARGS` environment variables consistent with the rest of the launcher.

## Gamepad-to-Mouse Daemon (`scripts/netflix-gamepad.py`)

### Inputs

Accepts a single argument: the Chromium PID. Exits immediately if the PID is not running.

### Controller Detection

Polls for an evdev gamepad device for up to 5 seconds at startup. If none is found, exits cleanly with a log message. Uses the first detected gamepad; does not switch devices if it disconnects.

### Button Mapping

| Input | Action | Implementation |
|-------|--------|----------------|
| Left stick | Cursor movement | `xdotool mousemove_relative` at ~60 Hz with dead zone (10%) and linear acceleration |
| D-pad | Discrete cursor jumps | Fixed 80px steps via `xdotool mousemove_relative` |
| A (cross) | Left click | `xdotool click 1` |
| B (circle) | Browser back | `xdotool key alt+Left` |
| X (square) | Escape | `xdotool key Escape` |
| Y (triangle) | Focus search | `xdotool key ctrl+f` (or click search icon coordinates as fallback) |
| LT | Scroll up | `xdotool click 4` (proportional to trigger depth) |
| RT | Scroll down | `xdotool click 5` (proportional to trigger depth) |
| Right stick, Start, Menu | — | Intentionally unbound |

### Lifecycle

- Polls Chromium PID every 2 seconds; exits when the process is gone.
- Traps SIGTERM/SIGINT for clean shutdown.
- All errors logged to `/tmp/mediaserver-launch.log`.

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| `xdotool` not installed | Log warning, launch Chromium without daemon |
| No gamepad connected | Daemon exits after 5s polling timeout; Chromium still opens |
| Chromium crashes | Daemon detects PID gone on next 2s tick, exits cleanly |
| Netflix unreachable (no internet) | curl 3s timeout hit on all probes; fall through to mouse mode |
| Multiple controllers connected | Use first detected device; no switching |

## Dependencies

New system packages required:

- `xdotool` — mouse/keyboard simulation (`apt`, `dnf`, `pacman`, `zypper`)
- `python3-evdev` — gamepad input reading via pip or system package

`install-system-deps.sh` must be updated to install both.

## Files Not Modified

- `mediaserver/` Python backend — no changes needed; `kind: command` tiles are already fully supported
- `mediaserver/static/` frontend — no changes needed
- Existing Chromium launch infrastructure — reused as-is
