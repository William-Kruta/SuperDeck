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
    const active = item.dataset.panel === panelId;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
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
