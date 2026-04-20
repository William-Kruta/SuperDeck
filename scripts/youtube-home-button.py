#!/usr/bin/env python3
"""Return to the SuperDeck window when the Xbox guide button is pressed."""

import os
import signal
import subprocess
import sys
import threading
import time

PID_CHECK_INTERVAL = 2.0
WINDOW_TITLE = os.getenv("SUPERDECK_HOME_WINDOW_TITLE", "SuperDeck")
FALLBACK_WINDOW_TITLES = ("SuperDeck", "127.0.0.1:8085", "localhost:8085")

_stop = threading.Event()


def pid_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


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
        print("[youtube-home] evdev not installed - install python3-evdev", file=sys.stderr)
        return None

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        for path in evdev.list_devices():
            try:
                dev = evdev.InputDevice(path)
            except OSError:
                continue

            caps = dev.capabilities()
            keys = caps.get(evdev.ecodes.EV_KEY, [])
            if evdev.ecodes.BTN_MODE in keys:
                print(f"[youtube-home] Using device: {dev.name}", file=sys.stderr)
                return dev
            dev.close()
        time.sleep(0.5)

    print("[youtube-home] No gamepad with BTN_MODE found after 5s - exiting.", file=sys.stderr)
    return None


def activate_home_window() -> None:
    print("[youtube-home] Xbox home button pressed.", file=sys.stderr, flush=True)
    for title in window_titles():
        if activate_window_by_title(title):
            return
    alt_tab_home()


def window_titles() -> tuple[str, ...]:
    titles = (WINDOW_TITLE, *FALLBACK_WINDOW_TITLES)
    return tuple(dict.fromkeys(title for title in titles if title))


def activate_window_by_title(title: str) -> bool:
    command = [
        "xdotool",
        "search",
        "--onlyvisible",
        "--name",
        title,
        "windowactivate",
    ]
    result = subprocess.run(command, capture_output=True)
    if result.returncode == 0:
        print(f"[youtube-home] Activated window matching: {title}", file=sys.stderr, flush=True)
        return True
    detail = result.stderr.decode(errors="replace").strip()
    if detail:
        print(f"[youtube-home] No window match for {title}: {detail}", file=sys.stderr, flush=True)
    return False


def alt_tab_home() -> None:
    result = subprocess.run(["xdotool", "key", "alt+Tab"], capture_output=True)
    if result.returncode == 0:
        print("[youtube-home] Fell back to Alt+Tab.", file=sys.stderr, flush=True)
        return
    print(
        f"[youtube-home] Alt+Tab fallback failed: {result.stderr.decode(errors='replace').strip()}",
        file=sys.stderr,
        flush=True,
    )


def run_loop(dev) -> None:
    import evdev
    from evdev import ecodes as e

    try:
        for event in dev.read_loop():
            if _stop.is_set():
                break
            if event.type == e.EV_KEY and event.code == e.BTN_MODE and event.value == 1:
                activate_home_window()
    except OSError:
        pass


def _handle_signal(*_) -> None:
    _stop.set()


def main() -> None:
    if len(sys.argv) > 2:
        print("Usage: youtube-home-button.py [chromium-pid]", file=sys.stderr)
        sys.exit(1)

    target_pid = None
    if len(sys.argv) == 2:
        try:
            target_pid = int(sys.argv[1])
        except ValueError:
            print(f"Invalid PID: {sys.argv[1]}", file=sys.stderr)
            sys.exit(1)

    if target_pid is not None and not pid_alive(target_pid):
        print(f"[youtube-home] PID {target_pid} not running - exiting.", file=sys.stderr)
        sys.exit(0)

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    dev = find_gamepad()
    if dev is None:
        sys.exit(0)

    if target_pid is not None:
        watcher = threading.Thread(target=watch_pid, args=(target_pid,), daemon=True)
        watcher.start()

    try:
        run_loop(dev)
    finally:
        dev.close()


if __name__ == "__main__":
    main()
