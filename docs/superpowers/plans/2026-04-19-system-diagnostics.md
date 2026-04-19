# System Diagnostics Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent topbar chip showing CPU temp, GPU temp, and GPU power draw, color-coded by severity, polling every 10 seconds.

**Architecture:** A new synchronous `GET /api/diagnostics` endpoint shells out to `sensors -j` (CPU) and `nvidia-smi` (GPU + power), returns nulls for unavailable values, and always responds 200. The frontend adds a `#diag-chip` element to the topbar and polls the endpoint every 10 seconds, applying CSS color classes based on temperature thresholds.

**Tech Stack:** Python/FastAPI (backend), vanilla JS + CSS custom properties (frontend), `lm-sensors` + `nvidia-smi` (system tools, already expected to be installed)

---

## File Map

| File | Change |
|---|---|
| `superdeck/app.py` | Add `DiagnosticsResponse` model + `GET /api/diagnostics` endpoint + two private helper functions |
| `superdeck/static/index.html` | Add `#diag-chip` markup in `.topbar-right` |
| `superdeck/static/styles.css` | Add diag chip CSS rules in the Topbar section |
| `superdeck/static/app.js` | Add DOM refs, `tempColor()`, `fetchDiagnostics()`, boot call + interval |
| `tests/test_diagnostics.py` | New test file for backend endpoint |

---

## Task 1: Backend — DiagnosticsResponse model and helper functions

**Files:**
- Modify: `superdeck/app.py` (after the existing `LogResponse` model, around line 148)
- Create: `tests/test_diagnostics.py`

- [ ] **Step 1: Create the test file**

```python
# tests/test_diagnostics.py
from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from superdeck.app import create_app


@pytest.fixture()
def client():
    return TestClient(create_app())


def test_diagnostics_returns_200(client):
    with patch("superdeck.app._read_cpu_temp", return_value=52), \
         patch("superdeck.app._read_gpu_stats", return_value=(48, 42.5)):
        resp = client.get("/api/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cpu_temp"] == 52
    assert data["gpu_temp"] == 48
    assert data["gpu_power_w"] == 42.5


def test_diagnostics_nulls_when_tools_missing(client):
    with patch("superdeck.app._read_cpu_temp", return_value=None), \
         patch("superdeck.app._read_gpu_stats", return_value=(None, None)):
        resp = client.get("/api/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["cpu_temp"] is None
    assert data["gpu_temp"] is None
    assert data["gpu_power_w"] is None
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd /mnt/machine_learning/Coding/python/servers/SuperDeck
uv run pytest tests/test_diagnostics.py -v
```

Expected: `ImportError` or `FAILED` — `_read_cpu_temp` and `_read_gpu_stats` don't exist yet.

- [ ] **Step 3: Add the model and helper functions to `superdeck/app.py`**

After the `LogResponse` model (around line 148), add the `DiagnosticsResponse` model:

```python
class DiagnosticsResponse(BaseModel):
    cpu_temp: int | None
    gpu_temp: int | None
    gpu_power_w: float | None
```

After the last private helper function at the bottom of `app.py` (after `_run_system_command`), add:

```python
def _read_cpu_temp() -> int | None:
    sensors = _resolve_executable(("sensors",))
    if sensors is None:
        return None
    try:
        result = subprocess.run(
            [sensors, "-j"],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout)
    except Exception:
        return None
    temps: list[float] = []
    for chip in data.values():
        if not isinstance(chip, dict):
            continue
        for section in chip.values():
            if not isinstance(section, dict):
                continue
            for key, val in section.items():
                lower = key.lower()
                if any(k in lower for k in ("core", "tctl", "tdie", "temp")) and "_input" in lower:
                    if isinstance(val, (int, float)):
                        temps.append(float(val))
    return int(max(temps)) if temps else None


def _read_gpu_stats() -> tuple[int | None, float | None]:
    nvidia_smi = _resolve_executable(("nvidia-smi",))
    if nvidia_smi is None:
        return None, None
    try:
        result = subprocess.run(
            [
                nvidia_smi,
                "--query-gpu=temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=1,
        )
        if result.returncode != 0:
            return None, None
        parts = [p.strip() for p in result.stdout.strip().split(",")]
        if len(parts) != 2:
            return None, None
        gpu_temp = None if parts[0] in ("", "[N/A]") else int(parts[0])
        gpu_power = None if parts[1] in ("", "[N/A]") else float(parts[1])
        return gpu_temp, gpu_power
    except Exception:
        return None, None
```

Also add `import json` to the imports at the top of `app.py` (it uses `tomllib` already, so add `json` alongside it).

- [ ] **Step 4: Run the tests — they should still fail** (endpoint not wired yet)

```bash
uv run pytest tests/test_diagnostics.py -v
```

Expected: `FAILED` — `_read_cpu_temp` now exists but the endpoint `/api/diagnostics` doesn't yet.

- [ ] **Step 5: Commit helpers and model**

```bash
git add superdeck/app.py tests/test_diagnostics.py
git commit -m "feat: add DiagnosticsResponse model and sensor helper functions"
```

---

## Task 2: Backend — wire the endpoint

**Files:**
- Modify: `superdeck/app.py` (inside the `create_app()` function, after the `/api/logs/launch` route)

- [ ] **Step 1: Add the route inside `create_app()`**

After the `@app.get("/api/logs/launch", ...)` route (around line 222), add:

```python
    @app.get("/api/diagnostics", response_model=DiagnosticsResponse)
    def diagnostics() -> DiagnosticsResponse:
        cpu_temp = _read_cpu_temp()
        gpu_temp, gpu_power_w = _read_gpu_stats()
        return DiagnosticsResponse(
            cpu_temp=cpu_temp,
            gpu_temp=gpu_temp,
            gpu_power_w=gpu_power_w,
        )
```

Note: this is `def` (synchronous), not `async def`, matching the spec.

- [ ] **Step 2: Run the tests — both should pass**

```bash
uv run pytest tests/test_diagnostics.py -v
```

Expected output:
```
PASSED tests/test_diagnostics.py::test_diagnostics_returns_200
PASSED tests/test_diagnostics.py::test_diagnostics_nulls_when_tools_missing
```

- [ ] **Step 3: Smoke-test the live endpoint**

Start the server (if not already running):
```bash
uv run python -m superdeck &
```

Then:
```bash
curl -s http://127.0.0.1:8085/api/diagnostics | python3 -m json.tool
```

Expected: JSON with `cpu_temp`, `gpu_temp`, `gpu_power_w` — real values or nulls depending on what's installed.

- [ ] **Step 4: Commit**

```bash
git add superdeck/app.py
git commit -m "feat: add GET /api/diagnostics endpoint"
```

---

## Task 3: Frontend HTML — add the chip markup

**Files:**
- Modify: `superdeck/static/index.html`

- [ ] **Step 1: Locate the insertion point**

Open `superdeck/static/index.html`. Find the `<div class="topbar-right">` block. It currently looks like:

```html
        <div class="topbar-right">
          <div class="status" id="controller-status">
            <span class="status-dot"></span>
            <span id="controller-status-text">Keyboard ready</span>
          </div>
          <button class="topbar-icon-btn info-btn" id="info-btn" ...
```

- [ ] **Step 2: Insert the chip between the status pill and the info button**

Add the following block after the closing `</div>` of `#controller-status` and before `<button ... id="info-btn"`:

```html
          <div class="diag-chip" id="diag-chip">
            <div class="diag-item">
              <span class="diag-label">CPU</span>
              <span class="diag-val" id="diag-cpu">—</span>
            </div>
            <div class="diag-sep"></div>
            <div class="diag-item">
              <span class="diag-label">GPU</span>
              <span class="diag-val" id="diag-gpu">—</span>
            </div>
            <div class="diag-sep"></div>
            <div class="diag-item">
              <span class="diag-label">PWR</span>
              <span class="diag-val" id="diag-pwr">—</span>
            </div>
          </div>
```

- [ ] **Step 3: Verify the page still loads without JS errors**

Hard-refresh the browser at `http://127.0.0.1:8085`. The chip should appear in the topbar with `—` dashes (unstyled for now). No console errors.

- [ ] **Step 4: Commit**

```bash
git add superdeck/static/index.html
git commit -m "feat: add diagnostics chip markup to topbar"
```

---

## Task 4: Frontend CSS — style the chip

**Files:**
- Modify: `superdeck/static/styles.css`

- [ ] **Step 1: Add chip styles after the `.status` block (around line 144)**

The `.status` block ends at line ~133. After the `@keyframes pulse` rule (line 144), add:

```css
/* ── Diagnostics chip ── */
.diag-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  transition: border-color 300ms ease;
}

.diag-chip.diag--hot {
  border-color: rgba(248, 113, 113, 0.4);
}

.diag-sep {
  width: 1px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.diag-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.diag-label {
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--muted);
}

.diag-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  line-height: 1;
}

.diag-val--cool { color: var(--status-green); }
.diag-val--warm { color: #f59e0b; }
.diag-val--hot  { color: var(--danger); }
```

- [ ] **Step 2: Verify chip appearance**

Hard-refresh `http://127.0.0.1:8085`. The chip should now look like three labeled columns (CPU / GPU / PWR) separated by thin dividers, matching the mockup from the design session. Values still show `—`.

- [ ] **Step 3: Commit**

```bash
git add superdeck/static/styles.css
git commit -m "feat: add diagnostics chip CSS styles"
```

---

## Task 5: Frontend JS — fetch, render, and poll

**Files:**
- Modify: `superdeck/static/app.js`

- [ ] **Step 1: Add DOM refs at the top of the file (after line 30)**

After the last `const` DOM ref declaration (around line 30), add:

```js
const diagChip = document.querySelector("#diag-chip");
const diagCpu  = document.querySelector("#diag-cpu");
const diagGpu  = document.querySelector("#diag-gpu");
const diagPwr  = document.querySelector("#diag-pwr");
```

- [ ] **Step 2: Add the helper and fetch function before the boot sequence (before line 1229)**

Find the section just before the boot lines at the bottom of the file:
```js
loadBackgrounds();
loadApps().catch((error) => showToast(error.message, true));
pollGamepad();
```

Insert above those lines:

```js
// ── Diagnostics ───────────────────────────────────────────────────────────
function tempColor(val) {
  if (val === null) return "";
  if (val >= 85) return "diag-val--hot";
  if (val >= 70) return "diag-val--warm";
  return "diag-val--cool";
}

async function fetchDiagnostics() {
  try {
    const d = await fetch("/api/diagnostics").then((r) => r.json());

    diagCpu.textContent = d.cpu_temp !== null ? `${d.cpu_temp}°` : "—";
    diagCpu.className   = `diag-val ${tempColor(d.cpu_temp)}`.trim();

    diagGpu.textContent = d.gpu_temp !== null ? `${d.gpu_temp}°` : "—";
    diagGpu.className   = `diag-val ${tempColor(d.gpu_temp)}`.trim();

    diagPwr.textContent = d.gpu_power_w !== null ? `${Math.round(d.gpu_power_w)}W` : "—";

    const isHot = (d.cpu_temp ?? 0) >= 85 || (d.gpu_temp ?? 0) >= 85;
    diagChip.classList.toggle("diag--hot", isHot);
  } catch {
    // silently ignore — chip retains stale/dash values
  }
}
```

- [ ] **Step 3: Wire to boot sequence**

Add the call and interval right after `pollGamepad();`:

```js
fetchDiagnostics();
setInterval(fetchDiagnostics, 10_000);
```

- [ ] **Step 4: Verify end-to-end in the browser**

Hard-refresh `http://127.0.0.1:8085`. Within a second the chip should update from `—` to real values. Open DevTools → Network, filter by `diagnostics` — confirm it fires once on load and again at the 10-second mark.

- [ ] **Step 5: Verify color states manually (optional but recommended)**

In the browser console, run:
```js
diagCpu.textContent = "91°"; diagCpu.className = "diag-val diag-val--hot"; diagChip.classList.add("diag--hot");
```
Confirm the CPU value turns red and the chip border turns red. Then:
```js
diagCpu.textContent = "72°"; diagCpu.className = "diag-val diag-val--warm"; diagChip.classList.remove("diag--hot");
```
Confirm yellow. Then:
```js
diagCpu.textContent = "52°"; diagCpu.className = "diag-val diag-val--cool";
```
Confirm green.

- [ ] **Step 6: Commit**

```bash
git add superdeck/static/app.js
git commit -m "feat: wire diagnostics chip polling in frontend"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run full test suite**

```bash
uv run pytest tests/ -v
```

Expected: all tests pass.

- [ ] **Step 2: Confirm the chip on a live reload**

Restart the server cleanly:
```bash
pkill -f "python -m superdeck"; uv run python -m superdeck &
```

Open `http://127.0.0.1:8085`, hard-refresh. Confirm:
- Chip appears between controller status and info button
- Values populate within 1 second
- Colors match temperature (green if cool, yellow if warm, red if hot)
- No console errors

- [ ] **Step 3: Commit any cleanup, then tag the feature complete**

```bash
git add -p  # stage any remaining changes
git commit -m "chore: finalize system diagnostics chip"
```
