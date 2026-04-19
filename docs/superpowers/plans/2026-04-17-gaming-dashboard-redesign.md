# Gaming Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the SuperDeck launcher UI to a gaming-dashboard aesthetic and add a Settings page (Appearance, Startup, System Info) accessed via a topbar gear button.

**Architecture:** Single-page app. `<body data-view="launcher|settings">` drives CSS visibility. All accent colors are CSS custom properties so themes swap by updating four vars. Theme and startup preference persist in `localStorage`. No backend changes.

**Tech Stack:** Vanilla JS, CSS custom properties, HTML5, FastAPI static file serving (unchanged)

---

### Task 1: Rewrite `styles.css` — gaming dashboard CSS + custom property theming

**Files:**
- Modify: `mediaserver/static/styles.css`

> No JS test framework exists in this project. Each task uses manual browser verification instead.

- [ ] **Step 1: Start the dev server**

```bash
cd /mnt/machine_learning/Coding/python/servers/SuperDeck
.venv/bin/python -m mediaserver
```

Open `http://localhost:8000` and note the current appearance.

- [ ] **Step 2: Replace `styles.css` entirely**

```css
:root {
  --accent-primary:   #00d4ff;
  --accent-secondary: #a78bfa;
  --glow-primary:     rgba(0, 212, 255, 0.3);
  --glow-secondary:   rgba(167, 139, 250, 0.3);
  --bg:      #080b0f;
  --surface: rgba(255, 255, 255, 0.03);
  --border:  rgba(255, 255, 255, 0.08);
  --text:    #ffffff;
  --muted:   rgba(255, 255, 255, 0.4);
  --status-green: #00ff88;
  --danger:  #f87171;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  min-height: 100vh;
}

/* Subtle cyan grid background */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
  z-index: 0;
}

/* Bottom-right corner bracket */
.corner-br {
  position: fixed;
  bottom: 16px; right: 16px;
  width: 60px; height: 60px;
  border-bottom: 2px solid var(--accent-secondary);
  border-right: 2px solid var(--accent-secondary);
  opacity: 0.25;
  pointer-events: none;
  z-index: 1;
}

.shell {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: 36px 48px;
  display: flex;
  flex-direction: column;
  gap: 40px;
}

/* ── Topbar ── */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand { display: flex; flex-direction: column; gap: 2px; }

.eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent-primary);
  opacity: 0.7;
  margin: 0;
}

h1 {
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 900;
  letter-spacing: -1px;
  line-height: 1;
  margin: 0;
}

h1 .accent { color: var(--accent-primary); }

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(0, 212, 255, 0.2);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--muted);
}

.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--status-green);
  box-shadow: 0 0 10px var(--status-green), 0 0 20px rgba(0, 255, 136, 0.4);
  animation: pulse 2s ease-in-out infinite;
  flex-shrink: 0;
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

.settings-btn {
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--muted);
  font-size: 18px;
  cursor: pointer;
  transition: all 120ms ease;
  line-height: 1;
}

.settings-btn:hover,
.settings-btn.is-active {
  background: rgba(0, 212, 255, 0.1);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 16px var(--glow-primary);
}

/* ── View switching ── */
[data-view="settings"] .launcher-view { display: none; }
[data-view="launcher"] .settings-view { display: none; }

/* ── Launcher view ── */
.launcher-view {
  display: flex;
  flex-direction: column;
  gap: 32px;
  flex: 1;
}

.stage {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.category-block {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.category-label {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent-primary);
}

.category-label[data-accent="secondary"] { color: var(--accent-secondary); }

.category-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: currentColor;
  opacity: 0.2;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

/* ── Tiles ── */
.tile {
  position: relative;
  padding: 22px 20px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: all 140ms ease;
  overflow: hidden;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: left;
  color: var(--text);
}

.tile::after {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 40px; height: 40px;
  border-top: 2px solid transparent;
  border-right: 2px solid transparent;
  transition: border-color 140ms ease;
}

.tile:focus { outline: none; }

.tile.is-focused {
  transform: translateY(-4px);
  border-color: var(--accent-primary);
  background: rgba(0, 212, 255, 0.05);
  box-shadow: 0 0 0 1px var(--accent-primary), 0 0 30px var(--glow-primary);
}

.tile.is-focused::after { border-color: var(--accent-primary); }

.tile[data-accent="secondary"].is-focused {
  border-color: var(--accent-secondary);
  background: rgba(167, 139, 250, 0.05);
  box-shadow: 0 0 0 1px var(--accent-secondary), 0 0 30px var(--glow-secondary);
}

.tile[data-accent="secondary"].is-focused::after { border-color: var(--accent-secondary); }

.tile-top { display: flex; flex-direction: column; gap: 6px; }

.tile-tag {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: var(--accent-primary);
}

.tile[data-accent="secondary"] .tile-tag { color: var(--accent-secondary); }

.tile-name {
  font-size: 24px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1;
}

.tile-description {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
  margin: 0;
}

/* ── Help bar ── */
.help {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.help span {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  font-size: 11px;
  color: var(--muted);
}

/* ── Toast ── */
.toast {
  position: fixed;
  right: 24px; bottom: 24px;
  max-width: min(420px, calc(100vw - 48px));
  padding: 14px 16px;
  border-radius: 6px;
  background: rgba(8, 11, 15, 0.95);
  border: 1px solid var(--border);
  color: var(--text);
  z-index: 100;
  font-size: 14px;
}

.toast.error { border-color: var(--danger); }

/* ── Lock overlay ── */
.lock-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(8, 11, 15, 0.9);
  text-align: center;
}

.lock-overlay[hidden] { display: none; }
.lock-overlay div { max-width: 520px; }

.lock-overlay .eyebrow { display: block; margin-bottom: 12px; }

.lock-overlay h2 {
  margin: 0 0 14px;
  font-size: 44px;
  font-weight: 900;
  letter-spacing: -1px;
  color: var(--accent-primary);
  text-shadow: 0 0 40px var(--glow-primary);
}

.lock-overlay p {
  margin: 0;
  color: var(--muted);
  font-size: 18px;
  line-height: 1.45;
}

/* ── Settings view ── */
.settings-view {
  display: flex;
  flex-direction: column;
  gap: 28px;
  flex: 1;
}

.settings-layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 24px;
  flex: 1;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--muted);
  transition: all 120ms ease;
  background: none;
  text-align: left;
  width: 100%;
}

.settings-nav-item:hover {
  color: rgba(255, 255, 255, 0.7);
  background: var(--surface);
}

.settings-nav-item.is-active {
  background: rgba(0, 212, 255, 0.08);
  border-color: rgba(0, 212, 255, 0.25);
  color: var(--accent-primary);
}

.settings-nav-icon { font-size: 16px; width: 20px; text-align: center; }

.settings-panel { display: none; flex-direction: column; gap: 28px; }
.settings-panel.is-active { display: flex; }

.panel-section-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent-primary);
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(0, 212, 255, 0.15);
}

.setting-row { display: flex; flex-direction: column; gap: 10px; }

.setting-label {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.8);
}

.setting-desc {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}

.setting-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
}

/* Theme swatches */
.theme-swatches {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}

.theme-swatch {
  padding: 14px 10px;
  border-radius: 6px;
  border: 2px solid transparent;
  cursor: pointer;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: all 120ms ease;
  background: none;
}

.theme-swatch[data-theme="cyan"]   { border-color: rgba(0, 212, 255, 0.3);   color: #00d4ff; background: rgba(0, 212, 255, 0.06); }
.theme-swatch[data-theme="purple"] { border-color: rgba(167, 139, 250, 0.3); color: #a78bfa; background: rgba(167, 139, 250, 0.06); }
.theme-swatch[data-theme="green"]  { border-color: rgba(0, 255, 136, 0.3);   color: #00ff88; background: rgba(0, 255, 136, 0.06); }
.theme-swatch[data-theme="amber"]  { border-color: rgba(251, 191, 36, 0.3);  color: #fbbf24; background: rgba(251, 191, 36, 0.06); }

.theme-swatch.is-active { box-shadow: 0 0 16px currentColor; }
.theme-swatch[data-theme="cyan"].is-active   { border-color: #00d4ff; }
.theme-swatch[data-theme="purple"].is-active { border-color: #a78bfa; }
.theme-swatch[data-theme="green"].is-active  { border-color: #00ff88; }
.theme-swatch[data-theme="amber"].is-active  { border-color: #fbbf24; }

/* Color pickers */
.color-picker-row { display: flex; gap: 12px; flex-wrap: wrap; }

.color-picker-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted);
  cursor: pointer;
  transition: border-color 120ms ease;
}

.color-picker-item:hover { border-color: rgba(255, 255, 255, 0.2); }

.color-picker-item input[type="color"] {
  width: 20px; height: 20px;
  border: none; border-radius: 50%;
  padding: 0; cursor: pointer;
  background: none;
  -webkit-appearance: none;
}

.color-picker-item input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
.color-picker-item input[type="color"]::-webkit-color-swatch { border-radius: 50%; border: none; }

/* Startup grid */
.startup-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.startup-option {
  padding: 14px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  cursor: pointer;
  text-align: center;
  transition: all 120ms ease;
  color: var(--muted);
}

.startup-option-name {
  font-size: 14px;
  font-weight: 700;
  color: inherit;
}

.startup-option-sub {
  font-size: 10px;
  margin-top: 4px;
  opacity: 0.6;
}

.startup-option.is-active {
  background: rgba(0, 212, 255, 0.08);
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 12px var(--glow-primary);
}

/* System info */
.sysinfo-section { display: flex; flex-direction: column; gap: 8px; }

.sysinfo-group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 4px;
}

.sysinfo-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  gap: 12px;
}

.sysinfo-key { color: var(--muted); font-size: 12px; }
.sysinfo-val { font-weight: 700; font-size: 12px; font-family: monospace; word-break: break-all; }

.badge-ok   { color: #00ff88; }
.badge-warn { color: #fbbf24; }
.badge-err  { color: var(--danger); }

/* Responsive */
@media (max-width: 700px) {
  .shell { padding: 22px; }
  .topbar { flex-wrap: wrap; gap: 12px; }
  .settings-layout { grid-template-columns: 1fr; }
  .theme-swatches { grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 3: Verify in browser**

Refresh `http://localhost:8000`. The background should be near-black with faint grid lines. Tiles may look unstyled (markup hasn't changed yet) — that's expected.

- [ ] **Step 4: Commit**

```bash
git add mediaserver/static/styles.css
git commit -m "feat: gaming dashboard CSS with CSS custom property theming"
```

---

### Task 2: Rewrite `index.html` — dual-view structure

**Files:**
- Modify: `mediaserver/static/index.html`

- [ ] **Step 1: Replace `index.html` entirely**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SuperDeck</title>
    <link rel="stylesheet" href="/static/styles.css" />
  </head>
  <body data-view="launcher">
    <div class="corner-br" aria-hidden="true"></div>

    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <p class="eyebrow">Local Console</p>
          <h1>Media<span class="accent">Server</span></h1>
        </div>
        <div class="topbar-right">
          <div class="status" id="controller-status">
            <span class="status-dot"></span>
            <span id="controller-status-text">Keyboard ready</span>
          </div>
          <button class="settings-btn" id="settings-btn" type="button"
                  aria-label="Settings" title="Settings (S)">⚙</button>
        </div>
      </header>

      <!-- ── Launcher view ── -->
      <div class="launcher-view">
        <section class="stage" aria-label="Apps">
          <div id="app-grid" role="listbox" aria-label="Launchable apps"></div>
        </section>
        <footer class="help" aria-label="Controls">
          <span>D-pad / stick: move</span>
          <span>A / Enter: launch</span>
          <span>B / Esc: home</span>
          <span>S / Select: settings</span>
        </footer>
      </div>

      <!-- ── Settings view ── -->
      <div class="settings-view" aria-label="Settings">
        <div class="settings-layout">

          <nav class="settings-nav" aria-label="Settings sections">
            <button class="settings-nav-item is-active" data-panel="appearance" type="button">
              <span class="settings-nav-icon">🎨</span> Appearance
            </button>
            <button class="settings-nav-item" data-panel="startup" type="button">
              <span class="settings-nav-icon">🚀</span> Startup
            </button>
            <button class="settings-nav-item" data-panel="sysinfo" type="button">
              <span class="settings-nav-icon">🖥</span> System Info
            </button>
          </nav>

          <!-- Appearance panel -->
          <div class="settings-panel is-active" id="panel-appearance">
            <div class="panel-section-title">Appearance</div>

            <div class="setting-row">
              <div class="setting-label">Color Theme</div>
              <div class="setting-desc">Preset accent color combinations</div>
              <div class="theme-swatches">
                <button class="theme-swatch" data-theme="cyan"   type="button">Cyan</button>
                <button class="theme-swatch" data-theme="purple" type="button">Purple</button>
                <button class="theme-swatch" data-theme="green"  type="button">Green</button>
                <button class="theme-swatch" data-theme="amber"  type="button">Amber</button>
              </div>
            </div>

            <div class="setting-divider"></div>

            <div class="setting-row">
              <div class="setting-label">Custom Colors</div>
              <div class="setting-desc">Override the preset with your own accent colors</div>
              <div class="color-picker-row">
                <label class="color-picker-item">
                  <input type="color" id="color-primary" value="#00d4ff" />
                  Primary accent
                </label>
                <label class="color-picker-item">
                  <input type="color" id="color-secondary" value="#a78bfa" />
                  Secondary accent
                </label>
              </div>
            </div>
          </div>

          <!-- Startup panel -->
          <div class="settings-panel" id="panel-startup">
            <div class="panel-section-title">Startup</div>
            <div class="setting-row">
              <div class="setting-label">Auto-launch on startup</div>
              <div class="setting-desc">Automatically open an app when SuperDeck loads. Select None to disable.</div>
              <div class="startup-grid" id="startup-grid"></div>
            </div>
          </div>

          <!-- System Info panel -->
          <div class="settings-panel" id="panel-sysinfo">
            <div class="panel-section-title">System Info</div>
            <div id="sysinfo-content">
              <p class="setting-desc">Open this panel to load system status.</p>
            </div>
          </div>

        </div>

        <footer class="help" aria-label="Settings controls">
          <span>↑↓: sections</span>
          <span>Enter: select</span>
          <span>Esc / S: back</span>
        </footer>
      </div>
    </main>

    <div class="lock-overlay" id="lock-overlay" hidden>
      <div>
        <span class="eyebrow">External app active</span>
        <h2 id="lock-title">Controller locked</h2>
        <p>Launcher input is paused. Press Escape or click here when you return.</p>
      </div>
    </div>

    <script src="/static/app.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Verify in browser**

Refresh `http://localhost:8000`. You should see:
- "Local Console" eyebrow + "SuperDeck" heading with a cyan "Server" span
- Pulsing green status dot
- Gear (⚙) button in the topbar
- Corner bracket bottom-right

The grid will be empty because the new JS hasn't been written yet.

- [ ] **Step 3: Commit**

```bash
git add mediaserver/static/index.html
git commit -m "feat: dual launcher/settings view HTML structure"
```

---

### Task 3: Rewrite `app.js` — complete implementation

**Files:**
- Modify: `mediaserver/static/app.js`

- [ ] **Step 1: Replace `app.js` entirely**

```js
// ── DOM refs ──────────────────────────────────────────────────────────────
const grid                = document.querySelector("#app-grid");
const controllerStatusEl  = document.querySelector("#controller-status-text");
const lockOverlay         = document.querySelector("#lock-overlay");
const lockTitle           = document.querySelector("#lock-title");
const settingsBtn         = document.querySelector("#settings-btn");
const startupGrid         = document.querySelector("#startup-grid");
const sysinfoContent      = document.querySelector("#sysinfo-content");

// ── State ─────────────────────────────────────────────────────────────────
let apps             = [];       // raw API response
let orderedApps      = [];       // apps in render order — matches tile DOM order
let focusedIndex     = 0;
let lastMoveAt       = 0;
let lastButtonState  = new Map();
let launcherInputLocked = false;

// ── Theme engine ──────────────────────────────────────────────────────────
const THEME_PRESETS = {
  cyan:   { primary: "#00d4ff", secondary: "#a78bfa" },
  purple: { primary: "#a78bfa", secondary: "#f472b6" },
  green:  { primary: "#00ff88", secondary: "#00d4ff" },
  amber:  { primary: "#fbbf24", secondary: "#f97316" },
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyTheme(primary, secondary) {
  const root = document.documentElement;
  root.style.setProperty("--accent-primary",   primary);
  root.style.setProperty("--accent-secondary", secondary);
  root.style.setProperty("--glow-primary",     hexToRgba(primary,   0.3));
  root.style.setProperty("--glow-secondary",   hexToRgba(secondary, 0.3));
  document.querySelector("#color-primary").value   = primary;
  document.querySelector("#color-secondary").value = secondary;
}

function loadTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem("ms-theme") || "{}");
    if (saved.preset && THEME_PRESETS[saved.preset]) {
      const { primary, secondary } = THEME_PRESETS[saved.preset];
      applyTheme(primary, secondary);
      markActiveSwatch(saved.preset);
    } else if (saved.primary && saved.secondary) {
      applyTheme(saved.primary, saved.secondary);
      markActiveSwatch(null);
    } else {
      applyTheme(THEME_PRESETS.cyan.primary, THEME_PRESETS.cyan.secondary);
      markActiveSwatch("cyan");
    }
  } catch {
    applyTheme(THEME_PRESETS.cyan.primary, THEME_PRESETS.cyan.secondary);
    markActiveSwatch("cyan");
  }
}

function markActiveSwatch(activePreset) {
  document.querySelectorAll(".theme-swatch").forEach((swatch) => {
    swatch.classList.toggle("is-active", swatch.dataset.theme === activePreset);
  });
}

// ── View switching ────────────────────────────────────────────────────────
function switchView(view) {
  document.body.dataset.view = view;
  settingsBtn.classList.toggle("is-active", view === "settings");
  if (view === "settings") {
    document.querySelector(".settings-nav-item")?.focus();
  } else {
    updateFocus();
  }
}

// ── Settings nav ──────────────────────────────────────────────────────────
const NAV_PANELS = ["appearance", "startup", "sysinfo"];
let settingsNavIndex = 0;

function activatePanel(panelId) {
  settingsNavIndex = NAV_PANELS.indexOf(panelId);

  document.querySelectorAll(".settings-nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.panel === panelId);
  });
  document.querySelectorAll(".settings-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-${panelId}`);
  });

  if (panelId === "startup") renderStartupGrid();
  if (panelId === "sysinfo") fetchSystemInfo();
}

// ── Apps ──────────────────────────────────────────────────────────────────
async function loadApps() {
  const response = await fetch("/api/apps");
  if (!response.ok) throw new Error("Unable to load apps");
  apps = await response.json();
  renderApps();
  checkStartupLaunch();
}

function renderApps() {
  orderedApps = [];
  const byCategory = new Map();
  apps.forEach((app) => {
    const cat = app.category || "Apps";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(app);
  });

  grid.innerHTML = "";

  byCategory.forEach((catApps, category) => {
    const isGames = category.toLowerCase() === "games";
    const accent  = isGames ? "secondary" : "primary";

    const block = document.createElement("div");
    block.className = "category-block";

    const label = document.createElement("div");
    label.className = "category-label";
    if (isGames) label.dataset.accent = "secondary";
    label.textContent = category;
    block.appendChild(label);

    const catGrid = document.createElement("div");
    catGrid.className = "grid";

    catApps.forEach((app) => {
      const index = orderedApps.length;
      orderedApps.push(app);

      const tile = document.createElement("button");
      tile.className = "tile";
      tile.type = "button";
      tile.dataset.index = String(index);
      if (accent === "secondary") tile.dataset.accent = "secondary";
      tile.setAttribute("role", "option");
      tile.innerHTML = `
        <div class="tile-top">
          <div class="tile-tag">${escapeHtml(app.category)}</div>
          <div class="tile-name">${escapeHtml(app.name)}</div>
        </div>
        <p class="tile-description">${escapeHtml(app.description || "")}</p>
      `;
      tile.addEventListener("click", () => {
        focusedIndex = index;
        updateFocus();
        launchFocusedApp();
      });
      catGrid.appendChild(tile);
    });

    block.appendChild(catGrid);
    grid.appendChild(block);
  });

  updateFocus();
}

function updateFocus() {
  const tiles = [...document.querySelectorAll(".tile")];
  tiles.forEach((tile, i) => {
    const focused = i === focusedIndex;
    tile.classList.toggle("is-focused", focused);
    tile.tabIndex = focused ? 0 : -1;
    tile.setAttribute("aria-selected", String(focused));
  });
  tiles[focusedIndex]?.focus({ preventScroll: false });
}

function moveFocus(direction) {
  if (launcherInputLocked || !orderedApps.length) return;
  const columns = currentColumnCount();
  if (direction === "left")  focusedIndex -= 1;
  if (direction === "right") focusedIndex += 1;
  if (direction === "up")    focusedIndex -= columns;
  if (direction === "down")  focusedIndex += columns;
  focusedIndex = Math.max(0, Math.min(orderedApps.length - 1, focusedIndex));
  updateFocus();
}

function currentColumnCount() {
  const tiles = [...document.querySelectorAll(".tile")];
  if (tiles.length < 2) return 1;
  const firstTop = tiles[0].offsetTop;
  return Math.max(1, tiles.filter((t) => t.offsetTop === firstTop).length);
}

async function launchFocusedApp() {
  if (launcherInputLocked) return;
  const app = orderedApps[focusedIndex];
  if (!app) return;
  try {
    const response = await fetch(`/api/apps/${app.id}/launch`, { method: "POST" });
    const result   = await response.json();
    if (!response.ok) throw new Error(result.detail || "Launch failed");
    lockLauncherInput(app.name);
    showToast(`${app.name} started`);
  } catch (error) {
    showToast(error.message, true);
  }
}

function lockLauncherInput(appName) {
  launcherInputLocked = true;
  lastButtonState = new Map();
  lockTitle.textContent = `${appName} is active`;
  lockOverlay.hidden = false;
  controllerStatusEl.textContent = "Controller locked";
}

function unlockLauncherInput() {
  launcherInputLocked = false;
  lastButtonState = new Map();
  lockOverlay.hidden = true;
  controllerStatusEl.textContent = "Keyboard ready";
  updateFocus();
}

// ── Startup auto-launch ───────────────────────────────────────────────────
function checkStartupLaunch() {
  try {
    const { startupAppId } = JSON.parse(localStorage.getItem("ms-startup") || "{}");
    if (!startupAppId) return;
    const idx = orderedApps.findIndex((a) => a.id === startupAppId);
    if (idx === -1) return;
    focusedIndex = idx;
    updateFocus();
    launchFocusedApp();
  } catch { /* ignore */ }
}

function renderStartupGrid() {
  if (!startupGrid) return;
  let savedId = null;
  try {
    savedId = JSON.parse(localStorage.getItem("ms-startup") || "{}").startupAppId ?? null;
  } catch { /* ignore */ }

  startupGrid.innerHTML = "";

  const noneBtn = document.createElement("button");
  noneBtn.type = "button";
  noneBtn.className = `startup-option${savedId === null ? " is-active" : ""}`;
  noneBtn.innerHTML = `<div class="startup-option-name">None</div><div class="startup-option-sub">Disabled</div>`;
  noneBtn.addEventListener("click", () => {
    localStorage.setItem("ms-startup", JSON.stringify({ startupAppId: null }));
    renderStartupGrid();
  });
  startupGrid.appendChild(noneBtn);

  apps.forEach((app) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `startup-option${app.id === savedId ? " is-active" : ""}`;
    btn.innerHTML = `
      <div class="startup-option-name">${escapeHtml(app.name)}</div>
      <div class="startup-option-sub">${escapeHtml(app.category)}</div>
    `;
    btn.addEventListener("click", () => {
      localStorage.setItem("ms-startup", JSON.stringify({ startupAppId: app.id }));
      renderStartupGrid();
    });
    startupGrid.appendChild(btn);
  });
}

// ── System info ───────────────────────────────────────────────────────────
async function fetchSystemInfo() {
  sysinfoContent.innerHTML = `<p class="setting-desc">Loading…</p>`;
  try {
    const [sessionRes, depsRes, servicesRes] = await Promise.all([
      fetch("/api/session"),
      fetch("/api/dependencies"),
      fetch("/api/services"),
    ]);
    const [session, deps, services] = await Promise.all([
      sessionRes.json(),
      depsRes.json(),
      servicesRes.json(),
    ]);
    renderSystemInfo(session, deps, services);
  } catch (err) {
    sysinfoContent.innerHTML = `<p class="setting-desc badge-err">Failed to load: ${escapeHtml(err.message)}</p>`;
  }
}

function renderSystemInfo(session, deps, services) {
  const row = (key, value) => {
    let cls = "";
    let display = "";
    if (value === true)       { cls = "badge-ok";  display = "✓ yes"; }
    else if (value === false) { cls = "badge-err"; display = "✗ no"; }
    else if (value == null)   { display = "—"; }
    else                      { display = escapeHtml(String(value)); }
    return `<div class="sysinfo-row">
      <span class="sysinfo-key">${escapeHtml(key)}</span>
      <span class="sysinfo-val ${cls}">${display}</span>
    </div>`;
  };

  const sessionRows = [
    row("Graphical session", session.has_graphical_session),
    row("Session type",      session.xdg_session_type),
    row("DISPLAY",           session.display),
    row("WAYLAND_DISPLAY",   session.wayland_display),
  ].join("");

  const depsRows = deps.map((d) => row(d.name, d.installed)).join("");

  const servicesRows = services.flatMap((s) => [
    row(`${s.name} installed`, s.installed),
    row(`${s.name} active`,    s.active),
    row(`${s.name} reachable`, s.reachable),
  ]).join("");

  sysinfoContent.innerHTML = `
    <div class="sysinfo-section">
      <div class="sysinfo-group-title">Session</div>${sessionRows}
    </div>
    <div class="sysinfo-section" style="margin-top:20px">
      <div class="sysinfo-group-title">Dependencies</div>${depsRows}
    </div>
    <div class="sysinfo-section" style="margin-top:20px">
      <div class="sysinfo-group-title">Services</div>${servicesRows}
    </div>
  `;
}

// ── Toast / utils ─────────────────────────────────────────────────────────
function showToast(message, error = false) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " error" : ""}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ── Settings wiring ───────────────────────────────────────────────────────
document.querySelectorAll(".settings-nav-item").forEach((item) => {
  item.addEventListener("click", () => activatePanel(item.dataset.panel));
});

document.querySelectorAll(".theme-swatch").forEach((swatch) => {
  swatch.addEventListener("click", () => {
    const preset = THEME_PRESETS[swatch.dataset.theme];
    if (!preset) return;
    applyTheme(preset.primary, preset.secondary);
    markActiveSwatch(swatch.dataset.theme);
    localStorage.setItem("ms-theme", JSON.stringify({ preset: swatch.dataset.theme }));
  });
});

document.querySelector("#color-primary").addEventListener("input", (e) => {
  const secondary = document.querySelector("#color-secondary").value;
  applyTheme(e.target.value, secondary);
  markActiveSwatch(null);
  localStorage.setItem("ms-theme", JSON.stringify({ primary: e.target.value, secondary }));
});

document.querySelector("#color-secondary").addEventListener("input", (e) => {
  const primary = document.querySelector("#color-primary").value;
  applyTheme(primary, e.target.value);
  markActiveSwatch(null);
  localStorage.setItem("ms-theme", JSON.stringify({ primary, secondary: e.target.value }));
});

settingsBtn.addEventListener("click", () => {
  switchView(document.body.dataset.view === "settings" ? "launcher" : "settings");
});

lockOverlay.addEventListener("click", unlockLauncherInput);

// ── Keyboard ──────────────────────────────────────────────────────────────
window.addEventListener("keydown", (event) => {
  const inSettings = document.body.dataset.view === "settings";

  if (event.key === "Escape") {
    event.preventDefault();
    if (launcherInputLocked) { unlockLauncherInput(); return; }
    if (inSettings) { switchView("launcher"); return; }
    focusedIndex = 0;
    updateFocus();
    return;
  }

  if ((event.key === "s" || event.key === "S") && !launcherInputLocked) {
    event.preventDefault();
    switchView(inSettings ? "launcher" : "settings");
    return;
  }

  if (inSettings) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      settingsNavIndex = Math.max(0, settingsNavIndex - 1);
      activatePanel(NAV_PANELS[settingsNavIndex]);
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      settingsNavIndex = Math.min(NAV_PANELS.length - 1, settingsNavIndex + 1);
      activatePanel(NAV_PANELS[settingsNavIndex]);
    }
    return;
  }

  if (launcherInputLocked) return;

  const arrowDir = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
  if (arrowDir[event.key]) {
    event.preventDefault();
    moveFocus(arrowDir[event.key]);
  }
  if (event.key === "Enter") {
    event.preventDefault();
    launchFocusedApp();
  }
});

// ── Gamepad ───────────────────────────────────────────────────────────────
window.addEventListener("gamepadconnected",    (e) => { controllerStatusEl.textContent = `${e.gamepad.id} connected`; });
window.addEventListener("gamepaddisconnected", ()  => { controllerStatusEl.textContent = "Keyboard ready"; });

function pollGamepad() {
  const gamepad = navigator.getGamepads?.().find(Boolean);
  if (gamepad) handleGamepad(gamepad);
  requestAnimationFrame(pollGamepad);
}

function handleGamepad(gamepad) {
  const inSettings = document.body.dataset.view === "settings";

  // Select button (index 8) toggles settings from either view
  if (buttonJustPressed(gamepad, 8)) {
    if (!launcherInputLocked) switchView(inSettings ? "launcher" : "settings");
    return;
  }

  if (inSettings) {
    if (buttonJustPressed(gamepad, 1)) switchView("launcher"); // B = back
    const vertical = gamepad.axes[1] || 0;
    const now = performance.now();
    if (now - lastMoveAt > 180) {
      if (vertical < -0.55 || isPressed(gamepad, 12)) {
        settingsNavIndex = Math.max(0, settingsNavIndex - 1);
        activatePanel(NAV_PANELS[settingsNavIndex]);
        lastMoveAt = now;
      }
      if (vertical > 0.55 || isPressed(gamepad, 13)) {
        settingsNavIndex = Math.min(NAV_PANELS.length - 1, settingsNavIndex + 1);
        activatePanel(NAV_PANELS[settingsNavIndex]);
        lastMoveAt = now;
      }
    }
    return;
  }

  if (launcherInputLocked || document.hidden) {
    updateButtonSnapshot(gamepad);
    return;
  }

  const now        = performance.now();
  const horizontal = gamepad.axes[0] || 0;
  const vertical   = gamepad.axes[1] || 0;

  if (now - lastMoveAt > 180) {
    if (horizontal < -0.55 || isPressed(gamepad, 14)) moveWithDelay("left",  now);
    if (horizontal >  0.55 || isPressed(gamepad, 15)) moveWithDelay("right", now);
    if (vertical   < -0.55 || isPressed(gamepad, 12)) moveWithDelay("up",    now);
    if (vertical   >  0.55 || isPressed(gamepad, 13)) moveWithDelay("down",  now);
  }

  if (buttonJustPressed(gamepad, 0)) launchFocusedApp();
  if (buttonJustPressed(gamepad, 1)) { focusedIndex = 0; updateFocus(); }
}

function moveWithDelay(direction, timestamp) {
  moveFocus(direction);
  lastMoveAt = timestamp;
}

function isPressed(gamepad, buttonIndex) {
  return Boolean(gamepad.buttons[buttonIndex]?.pressed);
}

function buttonJustPressed(gamepad, buttonIndex) {
  const pressed    = isPressed(gamepad, buttonIndex);
  const key        = `${gamepad.index}:${buttonIndex}`;
  const wasPressed = lastButtonState.get(key) || false;
  lastButtonState.set(key, pressed);
  return pressed && !wasPressed;
}

function updateButtonSnapshot(gamepad) {
  gamepad.buttons.forEach((button, i) => {
    lastButtonState.set(`${gamepad.index}:${i}`, button.pressed);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────
loadTheme();
loadApps().catch((error) => showToast(error.message, true));
pollGamepad();
```

- [ ] **Step 2: Verify launcher view**

Refresh `http://localhost:8000`. Confirm:
- Apps appear in category groups (Media / Games) with colored section labels and fading rule lines
- Focused tile has colored glow + corner bracket + lift animation
- `S` key opens settings; `Esc` returns to launcher

- [ ] **Step 3: Verify Appearance panel**

Press `S`, then confirm:
- Four theme swatches render (Cyan, Purple, Green, Amber)
- Clicking "Purple" changes tile borders, category labels, section titles, and lock overlay to purple immediately
- Clicking "Amber" changes everything to amber
- Custom color pickers update accents live as you drag the picker
- Refreshing the page restores the last chosen theme from `localStorage`

- [ ] **Step 4: Verify Startup panel**

Click "Startup" in the settings sidebar. Confirm:
- "None" option plus one tile per app
- Clicking "Jellyfin" marks it active (glowing border)
- Clicking "None" deselects
- Refreshing the page preserves the selection

- [ ] **Step 5: Verify System Info panel**

Click "System Info". Confirm:
- Shows "Loading…" briefly, then renders Session / Dependencies / Services sections
- `has_graphical_session: true` shows "✓ yes" in green; `false` shows "✗ no" in red
- String values (DISPLAY, paths) render in monospace

- [ ] **Step 6: Commit**

```bash
git add mediaserver/static/app.js
git commit -m "feat: gaming dashboard JS — theme engine, settings, startup, system info"
```

---

### Task 4: Add `.superpowers/` to `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Append to `.gitignore`**

Open `.gitignore` and add at the end:

```
.superpowers/
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .superpowers brainstorm directory"
```
