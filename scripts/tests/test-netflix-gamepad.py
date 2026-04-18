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
