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

_stop = threading.Event()


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True  # exists but we can't signal it


def xdo(args: list[str]) -> None:
    r = subprocess.run(["xdotool"] + args, capture_output=True)
    if r.returncode != 0:
        print(f"[netflix-gamepad] xdotool failed: {r.stderr.decode().strip()}", file=sys.stderr)


def apply_dead_zone(value: float) -> float:
    if abs(value) < DEAD_ZONE:
        return 0.0
    sign = 1 if value > 0 else -1
    return sign * (abs(value) - DEAD_ZONE) / (1.0 - DEAD_ZONE)


def watch_pid(pid: int) -> None:
    while not _stop.is_set():
        if not pid_alive(pid):
            _stop.set()
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
        for p in evdev.list_devices():
            try:
                dev = evdev.InputDevice(p)
            except OSError:
                continue
            caps = dev.capabilities()
            # Gamepad: has absolute axes (sticks) and buttons
            if evdev.ecodes.EV_ABS in caps and evdev.ecodes.EV_KEY in caps:
                print(f"[netflix-gamepad] Using device: {dev.name}", file=sys.stderr)
                return dev
            dev.close()
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

    def handle_event(event):
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
        while not _stop.is_set():
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
            if _stop.is_set():
                break
            handle_event(event)
    except OSError:
        pass  # device disconnected


def _handle_signal(*_):
    _stop.set()


def main() -> None:
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

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    dev = find_gamepad()
    if dev is None:
        sys.exit(0)

    watcher = threading.Thread(target=watch_pid, args=(target_pid,), daemon=True)
    watcher.start()

    try:
        run_loop(dev)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
