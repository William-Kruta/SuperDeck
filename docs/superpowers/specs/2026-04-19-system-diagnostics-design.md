# System Diagnostics Chip — Design Spec

**Date:** 2026-04-19
**Status:** Approved

## Summary

Add a persistent diagnostics chip to the SuperDeck topbar showing CPU temperature, GPU temperature, and GPU power draw. Updates every 10 seconds. Color-coded by temperature severity. No new Python dependencies.

## Placement

The chip sits in `.topbar-right`, between the controller-status pill and the info/settings buttons. It is always visible on the launcher view.

## Backend

### New endpoint: `GET /api/diagnostics`

Returns:

```json
{ "cpu_temp": 52, "gpu_temp": 48, "gpu_power_w": 42.5 }
```

Any value is `null` if the source tool is unavailable or parsing fails. The endpoint never raises an HTTP error — it always returns 200 with partial nulls so the frontend degrades gracefully.

**CPU temp** — run `sensors -j` (lm-sensors). Parse the JSON output and take the maximum value across all `*_input` fields whose key contains `Core`, `Tctl`, `Tdie`, or `temp`. If `sensors` is not on PATH or exits non-zero, `cpu_temp` is `null`.

**GPU temp + power** — run:
```
nvidia-smi --query-gpu=temperature.gpu,power.draw --format=csv,noheader,nounits
```
Split the single output line on `,`. Strip whitespace. Cast to `int` / `float`. If `nvidia-smi` is not on PATH, exits non-zero, or returns `[N/A]`, the affected field is `null`.

Both subprocesses run with `timeout=1` (seconds). A timeout yields `null` for affected fields; it does not crash the endpoint.

The endpoint is synchronous (`def`, not `async def`) and runs both subprocesses sequentially.

### Model

```python
class DiagnosticsResponse(BaseModel):
    cpu_temp: int | None
    gpu_temp: int | None
    gpu_power_w: float | None
```

## Frontend

### HTML (`superdeck/static/index.html`)

Add inside `.topbar-right`, after `#controller-status` and before `#info-btn`:

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
    <span class="diag-val diag-val--pwr" id="diag-pwr">—</span>
  </div>
</div>
```

### CSS (`superdeck/static/styles.css`)

New rules in the Topbar section:

- `.diag-chip` — same pill style as `.status` (background, border, border-radius, padding, flex row, gap)
- `.diag-sep` — 1px vertical divider, 24px tall, `rgba(255,255,255,0.1)`
- `.diag-item` — flex column, center-aligned, small gap
- `.diag-label` — 9px, letter-spacing, `var(--muted)`
- `.diag-val` — 14px, font-weight 700, default color `var(--text)`
- `.diag-val--cool` — color `var(--status-green)` (`#00ff88`)
- `.diag-val--warm` — color `#f59e0b`
- `.diag-val--hot` — color `var(--danger)` (`#f87171`)
- `.diag-chip.diag--hot` — border-color `rgba(248, 113, 113, 0.4)`

### JavaScript (`superdeck/static/app.js`)

**Temperature color helper:**
```js
function tempColor(val) {
  if (val === null) return "";
  if (val >= 85) return "diag-val--hot";
  if (val >= 70) return "diag-val--warm";
  return "diag-val--cool";
}
```

**Fetch and render:**
```js
async function fetchDiagnostics() {
  try {
    const d = await fetch("/api/diagnostics").then(r => r.json());
    const cpuEl = document.querySelector("#diag-cpu");
    const gpuEl = document.querySelector("#diag-gpu");
    const pwrEl = document.querySelector("#diag-pwr");
    const chip  = document.querySelector("#diag-chip");

    cpuEl.textContent = d.cpu_temp !== null ? `${d.cpu_temp}°` : "—";
    cpuEl.className   = `diag-val ${tempColor(d.cpu_temp)}`;

    gpuEl.textContent = d.gpu_temp !== null ? `${d.gpu_temp}°` : "—";
    gpuEl.className   = `diag-val ${tempColor(d.gpu_temp)}`;

    pwrEl.textContent = d.gpu_power_w !== null ? `${Math.round(d.gpu_power_w)}W` : "—";

    const isHot = (d.cpu_temp ?? 0) >= 85 || (d.gpu_temp ?? 0) >= 85;
    chip.classList.toggle("diag--hot", isHot);
  } catch {
    // silently ignore — chip shows stale/dash values
  }
}
```

Called once on `DOMContentLoaded`, then via `setInterval(fetchDiagnostics, 10_000)`.

## Error handling

| Scenario | Behavior |
|---|---|
| `sensors` not installed | `cpu_temp: null`, chip shows `—` in muted color |
| `nvidia-smi` not installed | `gpu_temp: null`, `gpu_power_w: null`, chips show `—` |
| Subprocess timeout (>1s) | Affected fields null, endpoint still returns 200 |
| Network error on frontend | `fetchDiagnostics` catches silently; chip retains last values |
| Both tools missing | Chip renders with all `—`, no error state shown |

## Files changed

| File | Change |
|---|---|
| `superdeck/app.py` | Add `DiagnosticsResponse` model + `GET /api/diagnostics` endpoint |
| `superdeck/static/index.html` | Add `#diag-chip` markup in `.topbar-right` |
| `superdeck/static/styles.css` | Add `.diag-chip`, `.diag-item`, `.diag-sep`, `.diag-val`, color modifier classes |
| `superdeck/static/app.js` | Add `tempColor()`, `fetchDiagnostics()`, wire to load + interval |
