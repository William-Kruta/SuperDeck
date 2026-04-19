// ── DOM refs ──────────────────────────────────────────────────────────────
const grid = document.querySelector("#app-grid");
const recentBlock = document.querySelector("#recent-block");
const recentGrid = document.querySelector("#recent-grid");
const controllerStatusEl = document.querySelector("#controller-status-text");
const lockOverlay = document.querySelector("#lock-overlay");
const lockTitle = document.querySelector("#lock-title");
const infoBtn = document.querySelector("#info-btn");
const infoModal = document.querySelector("#info-modal");
const infoClose = document.querySelector("#info-close");
const infoVersion = document.querySelector("#info-version");
const infoAuthorLink = document.querySelector("#info-author-link");
const infoGithubLink = document.querySelector("#info-github-link");
const settingsBtn = document.querySelector("#settings-btn");
const startupGrid = document.querySelector("#startup-grid");
const sysinfoContent = document.querySelector("#sysinfo-content");
const backgroundMedia = document.querySelector("#background-media");
const backgroundGrid = document.querySelector("#background-grid");
const backgroundUpload = document.querySelector("#background-upload");
const backgroundUploadStatus = document.querySelector(
  "#background-upload-status"
);
const tileAlphaInput = document.querySelector("#tile-alpha");
const tileAlphaValue = document.querySelector("#tile-alpha-value");
const tileAlphaReset = document.querySelector("#tile-alpha-reset");
const debugOverlay = document.querySelector("#debug-overlay");
const debugFocused = document.querySelector("#debug-focused");
const debugKey = document.querySelector("#debug-key");
const debugGamepad = document.querySelector("#debug-gamepad");
const debugButtons = document.querySelector("#debug-buttons");
const debugAxes = document.querySelector("#debug-axes");
const debugMove = document.querySelector("#debug-move");
const systemActionStatus = document.querySelector("#system-action-status");
const openLogBtn = document.querySelector("#open-log-btn");
const logViewer = document.querySelector("#log-viewer");
const diagChip = document.querySelector("#diag-chip");
const diagCpu  = document.querySelector("#diag-cpu");
const diagGpu  = document.querySelector("#diag-gpu");
const diagPwr  = document.querySelector("#diag-pwr");

// ── State ─────────────────────────────────────────────────────────────────
let apps = []; // raw API response
let orderedApps = []; // apps in render order — matches tile DOM order
let appStatuses = new Map();
let launchStates = new Map();
let backgrounds = [];
let focusedIndex = 0;
let lastMoveAt = 0;
let lastButtonState = new Map();
let lastAxisDirection = new Map();
let lastLauncherMove = { direction: null, at: 0 };
let launcherInputLocked = false;
let inputDebugEnabled = false;

const ABOUT_LINKS = {
  authorName: "William Kruta",
  authorUrl: "https://github.com/William-Kruta",
  repositoryUrl: "https://github.com/William-Kruta/SuperDeck",
};
const DEFAULT_TILE_ALPHA_PERCENT = 3;

// ── Theme engine ──────────────────────────────────────────────────────────
const THEME_PRESETS = {
  cyan: { primary: "#00d4ff", secondary: "#a78bfa" },
  purple: { primary: "#a78bfa", secondary: "#f472b6" },
  green: { primary: "#00ff88", secondary: "#00d4ff" },
  amber: { primary: "#fbbf24", secondary: "#f97316" },
};

function hexToRgba(hex, alpha) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(0, 212, 255, ${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyTheme(primary, secondary) {
  const root = document.documentElement;
  root.style.setProperty("--accent-primary", primary);
  root.style.setProperty("--accent-secondary", secondary);
  root.style.setProperty("--glow-primary", hexToRgba(primary, 0.3));
  root.style.setProperty("--glow-secondary", hexToRgba(secondary, 0.3));
  document.querySelector("#color-primary").value = primary;
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

// ── Tile opacity ──────────────────────────────────────────────────────────
function loadTileAlpha() {
  const saved = Number(localStorage.getItem("ms-tile-alpha"));
  const percent = Number.isFinite(saved) ? saved : DEFAULT_TILE_ALPHA_PERCENT;
  applyTileAlpha(percent);
}

function applyTileAlpha(percent) {
  const clamped = Math.max(0, Math.min(30, Number(percent)));
  document.documentElement.style.setProperty(
    "--tile-surface-alpha",
    String(clamped / 100)
  );
  tileAlphaInput.value = String(clamped);
  tileAlphaValue.textContent = `${clamped}%`;
}

function saveTileAlpha(percent) {
  localStorage.setItem("ms-tile-alpha", String(percent));
  applyTileAlpha(percent);
}

function resetTileAlpha() {
  localStorage.removeItem("ms-tile-alpha");
  applyTileAlpha(DEFAULT_TILE_ALPHA_PERCENT);
}

// ── Background media ──────────────────────────────────────────────────────
async function loadBackgrounds() {
  if (!backgroundGrid) return;
  try {
    const response = await fetch("/api/backgrounds");
    if (!response.ok) throw new Error("Unable to load backgrounds");
    backgrounds = await response.json();
    renderBackgroundGrid();
  } catch (error) {
    backgroundGrid.innerHTML = `<p class="setting-desc badge-err">Failed to load backgrounds: ${escapeHtml(
      error.message
    )}</p>`;
  }
}

function renderBackgroundGrid() {
  const selectedPath = selectedBackgroundPath();
  backgroundGrid.innerHTML = "";
  backgroundGrid.appendChild(backgroundOptionTile(null, "Default", "Grid"));

  backgrounds.forEach((background) => {
    backgroundGrid.appendChild(
      backgroundOptionTile(
        background,
        displayBackgroundName(background.name),
        background.kind
      )
    );
  });

  backgroundGrid.querySelectorAll(".background-option").forEach((option) => {
    option.classList.toggle(
      "is-active",
      option.dataset.path === (selectedPath || "")
    );
  });
}

function backgroundOptionTile(background, name, sublabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "background-option";
  button.dataset.path = background?.path || "";

  const preview = backgroundPreview(background);
  button.innerHTML = `
    <div class="background-preview">${preview}</div>
    <div class="background-option-name">${escapeHtml(name)}</div>
    <div class="background-option-sub">${escapeHtml(sublabel)}</div>
  `;
  button.addEventListener("click", () => {
    applyBackground(background);
    saveBackground(background);
    renderBackgroundGrid();
  });
  return button;
}

function backgroundPreview(background) {
  if (!background) return `<div class="background-preview-default"></div>`;
  if (background.kind === "video") {
    return `<video src="${escapeAttr(
      background.path
    )}" autoplay muted loop playsinline></video>`;
  }
  return `<img src="${escapeAttr(
    background.path
  )}" alt="" loading="lazy" decoding="async">`;
}

function loadSavedBackground() {
  try {
    const saved = JSON.parse(localStorage.getItem("ms-background") || "{}");
    if (saved.path && saved.kind) {
      applyBackground(saved);
    }
  } catch {
    applyBackground(null);
  }
}

function selectedBackgroundPath() {
  try {
    return JSON.parse(localStorage.getItem("ms-background") || "{}").path || "";
  } catch {
    return "";
  }
}

function applyBackground(background) {
  backgroundMedia.innerHTML = "";
  document.body.classList.toggle("has-background-media", Boolean(background));
  if (!background) return;

  if (background.kind === "video") {
    const video = document.createElement("video");
    video.src = background.path;
    video.autoplay = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    backgroundMedia.appendChild(video);
    video.play().catch(() => {});
    return;
  }

  const image = document.createElement("img");
  image.src = background.path;
  image.alt = "";
  image.decoding = "async";
  backgroundMedia.appendChild(image);
}

function saveBackground(background) {
  if (!background) {
    localStorage.setItem("ms-background", JSON.stringify({ path: null }));
    return;
  }
  localStorage.setItem(
    "ms-background",
    JSON.stringify({
      path: background.path,
      kind: background.kind,
      name: background.name,
    })
  );
}

async function uploadBackground(file) {
  if (!file) return;
  backgroundUploadStatus.textContent = "Uploading";
  try {
    const response = await fetch(
      `/api/backgrounds?filename=${encodeURIComponent(file.name)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: await file.arrayBuffer(),
      }
    );
    const uploaded = await response.json();
    if (!response.ok) throw new Error(uploaded.detail || "Upload failed");
    backgroundUploadStatus.textContent = "Uploaded";
    await loadBackgrounds();
    applyBackground(uploaded);
    saveBackground(uploaded);
    renderBackgroundGrid();
  } catch (error) {
    backgroundUploadStatus.textContent = error.message;
  } finally {
    backgroundUpload.value = "";
  }
}

function displayBackgroundName(name) {
  return name.replace(/\.[^.]+$/, "").replaceAll("-", " ");
}

// ── View switching ────────────────────────────────────────────────────────
function switchView(view) {
  document.body.dataset.view = view;
  lastMoveAt = 0;
  lastAxisDirection = new Map();
  lastLauncherMove = { direction: null, at: 0 };
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
  loadAppStatuses();
  checkStartupLaunch();
}

async function loadAppStatuses() {
  try {
    const response = await fetch("/api/app-statuses");
    if (!response.ok) throw new Error("Unable to load app statuses");
    const statuses = await response.json();
    appStatuses = new Map(statuses.map((status) => [status.app_id, status]));
    updateTileStatuses();
  } catch {
    appStatuses = new Map();
    updateTileStatuses("unknown");
  }
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
  renderRecentApps();

  byCategory.forEach((catApps, category) => {
    const isGames = category.toLowerCase() === "games";
    const accent = isGames ? "secondary" : "primary";

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
      const logoSrc = app.logo;
      if (logoSrc) {
        tile.classList.add("tile--logo");
        tile.dataset.logo = app.id;
      }
      if (app.artwork) {
        tile.classList.add("tile--artwork");
        tile.style.setProperty(
          "--tile-artwork",
          `url("${cssUrl(app.artwork)}")`
        );
      }
      tile.innerHTML = `
        <div class="tile-status" data-status="loading" title="Checking status">
          <span class="tile-status-dot"></span>
        </div>
        <div class="tile-launch-state" hidden></div>
        ${
          logoSrc
            ? `<div class="tile-logo-wrap"><img class="tile-logo" src="${escapeAttr(
                logoSrc
              )}" alt="" loading="lazy" decoding="async"></div>`
            : ""
        }
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
  updateTileStatuses();
  updateAllLaunchStates();
}

function renderRecentApps() {
  const recentApps = recentAppIds()
    .map((appId) => apps.find((app) => app.id === appId))
    .filter(Boolean)
    .slice(0, 3);

  recentBlock.hidden = recentApps.length === 0;
  recentGrid.innerHTML = "";
  recentApps.forEach((app) => {
    const index = orderedApps.length;
    orderedApps.push(app);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile tile--recent";
    button.dataset.index = String(index);
    if (app.category?.toLowerCase() === "games")
      button.dataset.accent = "secondary";
    const logoSrc = app.logo;
    if (logoSrc) {
      button.classList.add("tile--logo");
      button.dataset.logo = app.id;
    }
    button.innerHTML = `
      <div class="tile-status" data-status="loading" title="Checking status">
        <span class="tile-status-dot"></span>
      </div>
      <div class="tile-launch-state" hidden></div>
      ${
        logoSrc
          ? `<div class="tile-logo-wrap"><img class="tile-logo" src="${escapeAttr(
              logoSrc
            )}" alt="" loading="lazy" decoding="async"></div>`
          : ""
      }
      <div class="tile-top">
        <div class="tile-tag">Recent</div>
        <div class="tile-name">${escapeHtml(app.name)}</div>
      </div>
      <p class="tile-description">${escapeHtml(app.description || "")}</p>
    `;
    button.addEventListener("click", () => {
      focusedIndex = index;
      updateFocus();
      launchFocusedApp();
    });
    recentGrid.appendChild(button);
  });
}

function recentAppIds() {
  try {
    return JSON.parse(localStorage.getItem("ms-recent-apps") || "[]");
  } catch {
    return [];
  }
}

function rememberRecentApp(appId) {
  const next = [appId, ...recentAppIds().filter((id) => id !== appId)].slice(
    0,
    3
  );
  localStorage.setItem("ms-recent-apps", JSON.stringify(next));
  renderApps();
}

function updateTileStatuses(fallbackState = null) {
  document.querySelectorAll(".tile").forEach((tile) => {
    const app = orderedApps[Number(tile.dataset.index)];
    const statusEl = tile.querySelector(".tile-status");
    if (!app || !statusEl) return;

    const status = appStatuses.get(app.id);
    const state = status?.state || fallbackState || "loading";
    const label = status?.label || (fallbackState ? "Unknown" : "Checking");
    statusEl.dataset.status = state;
    statusEl.title = status?.detail || label;
    statusEl.setAttribute("aria-label", label);
  });
}

function updateAllLaunchStates() {
  document.querySelectorAll(".tile").forEach((tile) => {
    const app = orderedApps[Number(tile.dataset.index)];
    const launchState = app ? launchStates.get(app.id) : null;
    updateTileLaunchState(
      tile,
      launchState?.state || "",
      launchState?.label || ""
    );
  });
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
  updateDebugFocused();
}

function moveFocus(direction) {
  if (launcherInputLocked || !orderedApps.length) return;
  if (isDuplicateLauncherMove(direction)) return;
  if (direction === "left" || direction === "right") {
    moveHorizontalFocus(direction);
  } else {
    moveVerticalFocus(direction);
  }
  updateDebug("move", direction);
  updateFocus();
}

function isDuplicateLauncherMove(direction) {
  const now = performance.now();
  const duplicate =
    lastLauncherMove.direction === direction && now - lastLauncherMove.at < 160;
  if (!duplicate) lastLauncherMove = { direction, at: now };
  return duplicate;
}

function moveHorizontalFocus(direction) {
  const tiles = getTileRects();
  const current = tiles.find((tile) => tile.index === focusedIndex);
  if (!current) return;

  const candidates = tiles
    .filter((tile) =>
      direction === "left"
        ? tile.right < current.centerX - 8
        : tile.left > current.centerX + 8
    )
    .map((tile) => {
      const dx = Math.abs(tile.centerX - current.centerX);
      const dy = Math.abs(tile.centerY - current.centerY);
      return { ...tile, score: dx + dy * 3 };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);

  if (candidates[0]) {
    focusedIndex = candidates[0].index;
    return;
  }

  const wrapped = horizontalWrapTarget(tiles, current, direction);
  if (wrapped) focusedIndex = wrapped.index;
}

function horizontalWrapTarget(tiles, current, direction) {
  const rowTolerance = current.height / 2;
  const targetRows = tiles
    .filter((tile) =>
      direction === "right"
        ? tile.centerY > current.centerY + rowTolerance
        : tile.centerY < current.centerY - rowTolerance
    )
    .sort((a, b) =>
      direction === "right"
        ? a.centerY - b.centerY || a.left - b.left
        : b.centerY - a.centerY || b.right - a.right
    );

  if (!targetRows[0]) return null;
  const targetY = targetRows[0].centerY;
  const rowTiles = targetRows.filter(
    (tile) => Math.abs(tile.centerY - targetY) <= rowTolerance
  );

  return rowTiles.sort((a, b) =>
    direction === "right" ? a.left - b.left : b.right - a.right
  )[0];
}

function moveVerticalFocus(direction) {
  const tiles = getTileRects();
  const current = tiles.find((tile) => tile.index === focusedIndex);
  if (!current) return;

  const candidates = tiles
    .filter((tile) =>
      direction === "up"
        ? tile.centerY < current.centerY - 8
        : tile.centerY > current.centerY + 8
    )
    .map((tile) => {
      const dx = Math.abs(tile.centerX - current.centerX);
      const dy = Math.abs(tile.centerY - current.centerY);
      return { ...tile, score: dx * 2 + dy };
    })
    .sort((a, b) => a.score - b.score || a.index - b.index);

  if (candidates[0]) focusedIndex = candidates[0].index;
}

function getTileRects() {
  return [...document.querySelectorAll(".tile")].map((tile) => {
    const rect = tile.getBoundingClientRect();
    return {
      index: Number(tile.dataset.index),
      left: rect.left,
      right: rect.right,
      height: rect.height,
      centerX: rect.left + rect.width / 2,
      centerY: rect.top + rect.height / 2,
    };
  });
}

async function launchFocusedApp() {
  if (launcherInputLocked) return;
  const app = orderedApps[focusedIndex];
  if (!app) return;
  await launchApp(app);
}

async function launchApp(app) {
  if (launcherInputLocked || !app) return;
  setLaunchState(app.id, "launching", "Launching");
  try {
    const response = await fetch(`/api/apps/${app.id}/launch`, {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Launch failed");
    rememberRecentApp(app.id);
    setLaunchState(app.id, "active", "Active");
    lockLauncherInput(app.name);
    showToast(`${app.name} started`);
  } catch (error) {
    setLaunchState(app.id, "failed", "Failed");
    showToast(error.message, true);
  }
}

function setLaunchState(appId, state, label) {
  launchStates.set(appId, { state, label });
  document.querySelectorAll(".tile").forEach((tile) => {
    const app = orderedApps[Number(tile.dataset.index)];
    if (app?.id === appId) updateTileLaunchState(tile, state, label);
  });
}

function updateTileLaunchState(tile, state, label) {
  const stateEl = tile.querySelector(".tile-launch-state");
  if (!stateEl) return;
  stateEl.hidden = !state;
  stateEl.dataset.state = state || "";
  stateEl.textContent = label || "";
}

function clearActiveLaunchState() {
  launchStates.forEach((value, appId) => {
    if (value.state === "active") setLaunchState(appId, "", "");
  });
}

function lockLauncherInput(appName) {
  launcherInputLocked = true;
  lastButtonState = new Map();
  lastAxisDirection = new Map();
  lastLauncherMove = { direction: null, at: 0 };
  lockTitle.textContent = `${appName} is active`;
  lockOverlay.hidden = false;
  controllerStatusEl.textContent = "Controller locked";
}

function unlockLauncherInput() {
  launcherInputLocked = false;
  lastButtonState = new Map();
  lastAxisDirection = new Map();
  lastLauncherMove = { direction: null, at: 0 };
  lockOverlay.hidden = true;
  controllerStatusEl.textContent = "Keyboard ready";
  clearActiveLaunchState();
  updateFocus();
}

// ── Info modal ────────────────────────────────────────────────────────────
async function openInfoModal() {
  infoModal.hidden = false;
  infoClose.focus();
  renderAboutLinks();
  await loadAboutInfo();
}

function closeInfoModal() {
  infoModal.hidden = true;
  infoBtn.focus();
}

function renderAboutLinks() {
  infoAuthorLink.textContent = ABOUT_LINKS.authorName;
  infoAuthorLink.href = ABOUT_LINKS.authorUrl;
  infoGithubLink.href = ABOUT_LINKS.repositoryUrl;
}

async function loadAboutInfo() {
  infoVersion.textContent = "Loading";
  try {
    const response = await fetch("/api/about");
    if (!response.ok) throw new Error("Unable to load version");
    const about = await response.json();
    infoVersion.textContent = about.version || "unknown";
  } catch {
    infoVersion.textContent = "unknown";
  }
}

// ── Input debug ───────────────────────────────────────────────────────────
function toggleInputDebug() {
  inputDebugEnabled = !inputDebugEnabled;
  debugOverlay.hidden = !inputDebugEnabled;
  updateDebugFocused();
}

function updateDebug(type, value) {
  if (!inputDebugEnabled) return;
  if (type === "key") debugKey.textContent = value;
  if (type === "gamepad") debugGamepad.textContent = value;
  if (type === "buttons") debugButtons.textContent = value;
  if (type === "axes") debugAxes.textContent = value;
  if (type === "move") debugMove.textContent = value;
}

function updateDebugFocused() {
  if (!inputDebugEnabled) return;
  const app = orderedApps[focusedIndex];
  debugFocused.textContent = app ? `${focusedIndex}: ${app.name}` : "-";
}

function updateGamepadDebug(gamepad, horizontal, vertical) {
  if (!inputDebugEnabled) return;
  const pressed = gamepad.buttons
    .map((button, index) => (button.pressed ? index : null))
    .filter((index) => index !== null)
    .join(", ");
  updateDebug("gamepad", gamepad.id || `Gamepad ${gamepad.index}`);
  updateDebug("buttons", pressed || "-");
  updateDebug("axes", `x:${horizontal.toFixed(2)} y:${vertical.toFixed(2)}`);
}

// ── Startup auto-launch ───────────────────────────────────────────────────
function checkStartupLaunch() {
  try {
    const { startupAppId } = JSON.parse(
      localStorage.getItem("ms-startup") || "{}"
    );
    if (!startupAppId) return;
    const idx = orderedApps.findIndex((a) => a.id === startupAppId);
    if (idx === -1) return;
    focusedIndex = idx;
    updateFocus();
    launchFocusedApp();
  } catch {
    /* ignore */
  }
}

function renderStartupGrid() {
  if (!startupGrid) return;
  let savedId = null;
  try {
    savedId =
      JSON.parse(localStorage.getItem("ms-startup") || "{}").startupAppId ??
      null;
  } catch {
    /* ignore */
  }

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

  orderedApps.forEach((app) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `startup-option${app.id === savedId ? " is-active" : ""}`;
    btn.innerHTML = `
      <div class="startup-option-name">${escapeHtml(app.name)}</div>
      <div class="startup-option-sub">${escapeHtml(app.category)}</div>
    `;
    btn.addEventListener("click", () => {
      localStorage.setItem(
        "ms-startup",
        JSON.stringify({ startupAppId: app.id })
      );
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
    if (!sessionRes.ok || !depsRes.ok || !servicesRes.ok)
      throw new Error(
        `API error (session:${sessionRes.status} deps:${depsRes.status} services:${servicesRes.status})`
      );
    const [session, deps, services] = await Promise.all([
      sessionRes.json(),
      depsRes.json(),
      servicesRes.json(),
    ]);
    renderSystemInfo(session, deps, services);
  } catch (err) {
    sysinfoContent.innerHTML = `<p class="setting-desc badge-err">Failed to load: ${escapeHtml(
      err.message
    )}</p>`;
  }
}

function renderSystemInfo(session, deps, services) {
  const row = (key, value) => {
    let cls = "";
    let display = "";
    if (value === true) {
      cls = "badge-ok";
      display = "✓ yes";
    } else if (value === false) {
      cls = "badge-err";
      display = "✗ no";
    } else if (value == null) {
      display = "—";
    } else {
      display = escapeHtml(String(value));
    }
    return `<div class="sysinfo-row">
      <span class="sysinfo-key">${escapeHtml(key)}</span>
      <span class="sysinfo-val ${cls}">${display}</span>
    </div>`;
  };

  const sessionRows = [
    row("Graphical session", session.has_graphical_session),
    row("Session type", session.xdg_session_type),
    row("DISPLAY", session.display),
    row("WAYLAND_DISPLAY", session.wayland_display),
  ].join("");

  const depsRows = deps.map((d) => row(d.name, d.installed)).join("");

  const servicesRows = services
    .flatMap((s) => [
      row(`${s.name} installed`, s.installed),
      row(`${s.name} active`, s.active),
      row(`${s.name} reachable`, s.reachable),
    ])
    .join("");

  sysinfoContent.innerHTML = `
    <div class="sysinfo-section">
      <div class="sysinfo-group-title">Session</div>${sessionRows}
    </div>
    <div class="sysinfo-section sysinfo-section--gap">
      <div class="sysinfo-group-title">Dependencies</div>${depsRows}
    </div>
    <div class="sysinfo-section sysinfo-section--gap">
      <div class="sysinfo-group-title">Services</div>${servicesRows}
    </div>
  `;
}

// ── System actions ────────────────────────────────────────────────────────
async function runSystemAction(action) {
  const label = systemActionLabel(action);
  if (!window.confirm(`${label}?`)) return;
  systemActionStatus.textContent = `${label} requested`;
  try {
    const response = await fetch(`/api/system/actions/${action}`, {
      method: "POST",
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Action failed");
    systemActionStatus.textContent = result.detail;
  } catch (error) {
    systemActionStatus.textContent = error.message;
  }
}

async function openLaunchLog() {
  logViewer.hidden = false;
  logViewer.textContent = "Loading logs...";
  try {
    const response = await fetch("/api/logs/launch");
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || "Unable to load logs");
    logViewer.textContent =
      result.content || `No log entries yet at ${result.path}`;
  } catch (error) {
    logViewer.textContent = error.message;
  }
}

function systemActionLabel(action) {
  return (
    {
      restart_mediaserver: "Restart SuperDeck",
      quit_mediaserver: "Quit SuperDeck",
      restart_jellyfin: "Restart Jellyfin",
      sleep: "Sleep system",
      shutdown: "Shutdown system",
    }[action] || action
  );
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

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssUrl(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
    localStorage.setItem(
      "ms-theme",
      JSON.stringify({ preset: swatch.dataset.theme })
    );
  });
});

document.querySelector("#color-primary").addEventListener("input", (e) => {
  const secondary = document.querySelector("#color-secondary").value;
  applyTheme(e.target.value, secondary);
  markActiveSwatch(null);
  localStorage.setItem(
    "ms-theme",
    JSON.stringify({ primary: e.target.value, secondary })
  );
});

document.querySelector("#color-secondary").addEventListener("input", (e) => {
  const primary = document.querySelector("#color-primary").value;
  applyTheme(primary, e.target.value);
  markActiveSwatch(null);
  localStorage.setItem(
    "ms-theme",
    JSON.stringify({ primary, secondary: e.target.value })
  );
});

backgroundUpload.addEventListener("change", () => {
  uploadBackground(backgroundUpload.files?.[0]);
});

tileAlphaInput.addEventListener("input", (event) => {
  saveTileAlpha(event.target.value);
});

tileAlphaReset.addEventListener("click", resetTileAlpha);

document.querySelectorAll(".system-action[data-action]").forEach((button) => {
  button.addEventListener("click", () =>
    runSystemAction(button.dataset.action)
  );
});

openLogBtn.addEventListener("click", openLaunchLog);

settingsBtn.addEventListener("click", () => {
  switchView(
    document.body.dataset.view === "settings" ? "launcher" : "settings"
  );
});

infoBtn.addEventListener("click", openInfoModal);
infoClose.addEventListener("click", closeInfoModal);
infoModal.addEventListener("click", closeInfoModal);
document.querySelector(".info-dialog").addEventListener("click", (event) => {
  event.stopPropagation();
});

lockOverlay.addEventListener("click", unlockLauncherInput);

// ── Keyboard ──────────────────────────────────────────────────────────────
window.addEventListener("keydown", (event) => {
  const inSettings = document.body.dataset.view === "settings";
  updateDebug("key", `${event.key}${event.repeat ? " (repeat)" : ""}`);

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    toggleInputDebug();
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    if (!infoModal.hidden) {
      closeInfoModal();
      return;
    }
    if (launcherInputLocked) {
      unlockLauncherInput();
      return;
    }
    if (inSettings) {
      switchView("launcher");
      return;
    }
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

  const arrowDir = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };
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
window.addEventListener("gamepadconnected", (e) => {
  controllerStatusEl.textContent = `${e.gamepad.id} connected`;
});
window.addEventListener("gamepaddisconnected", () => {
  controllerStatusEl.textContent = "Keyboard ready";
});

function pollGamepad() {
  const gamepad = navigator.getGamepads?.().find(Boolean);
  if (gamepad) handleGamepad(gamepad);
  requestAnimationFrame(pollGamepad);
}

function handleGamepad(gamepad) {
  const inSettings = document.body.dataset.view === "settings";
  const horizontal = gamepad.axes[0] || 0;
  const vertical = gamepad.axes[1] || 0;
  updateGamepadDebug(gamepad, horizontal, vertical);

  if (isPressed(gamepad, 8) && buttonJustPressed(gamepad, 9)) {
    toggleInputDebug();
    updateButtonSnapshot(gamepad);
    return;
  }

  // Select button (index 8) toggles settings from either view
  if (buttonJustPressed(gamepad, 8)) {
    updateButtonSnapshot(gamepad);
    if (!launcherInputLocked) switchView(inSettings ? "launcher" : "settings");
    return;
  }

  if (inSettings) {
    if (document.hidden) {
      updateButtonSnapshot(gamepad);
      return;
    }
    if (buttonJustPressed(gamepad, 1)) {
      switchView("launcher"); // B = back
      updateButtonSnapshot(gamepad);
      return;
    }
    const now = performance.now();
    if (now - lastMoveAt > 180) {
      if (vertical < -0.55 || buttonJustPressed(gamepad, 12)) {
        settingsNavIndex = Math.max(0, settingsNavIndex - 1);
        activatePanel(NAV_PANELS[settingsNavIndex]);
        lastMoveAt = now;
      }
      if (vertical > 0.55 || buttonJustPressed(gamepad, 13)) {
        settingsNavIndex = Math.min(
          NAV_PANELS.length - 1,
          settingsNavIndex + 1
        );
        activatePanel(NAV_PANELS[settingsNavIndex]);
        lastMoveAt = now;
      }
    }
    updateButtonSnapshot(gamepad);
    return;
  }

  if (launcherInputLocked || document.hidden) {
    updateButtonSnapshot(gamepad);
    return;
  }

  const now = performance.now();
  const dpadDirection = justPressedDirection(gamepad);
  const axisDirection = axisJustMoved(gamepad, horizontal, vertical);
  if (dpadDirection) {
    moveWithDelay(dpadDirection, now);
  } else if (!isDpadPressed(gamepad) && axisDirection) {
    moveWithDelay(axisDirection, now);
  }

  if (buttonJustPressed(gamepad, 0)) launchFocusedApp();
  if (buttonJustPressed(gamepad, 1)) {
    focusedIndex = 0;
    updateFocus();
  }
  updateButtonSnapshot(gamepad);
}

function moveWithDelay(direction, timestamp) {
  moveFocus(direction);
  lastMoveAt = timestamp;
}

function isPressed(gamepad, buttonIndex) {
  return Boolean(gamepad.buttons[buttonIndex]?.pressed);
}

function justPressedDirection(gamepad) {
  if (buttonJustPressed(gamepad, 14)) return "left";
  if (buttonJustPressed(gamepad, 15)) return "right";
  if (buttonJustPressed(gamepad, 12)) return "up";
  if (buttonJustPressed(gamepad, 13)) return "down";
  return null;
}

function isDpadPressed(gamepad) {
  return [12, 13, 14, 15].some((buttonIndex) =>
    isPressed(gamepad, buttonIndex)
  );
}

function axisJustMoved(gamepad, horizontal, vertical) {
  const horizontalDirection = axisDirection(horizontal, "left", "right");
  const verticalDirection = axisDirection(vertical, "up", "down");
  const horizontalKey = `${gamepad.index}:axis-x`;
  const verticalKey = `${gamepad.index}:axis-y`;
  const previousHorizontal = lastAxisDirection.get(horizontalKey) || null;
  const previousVertical = lastAxisDirection.get(verticalKey) || null;

  lastAxisDirection.set(horizontalKey, horizontalDirection);
  lastAxisDirection.set(verticalKey, verticalDirection);

  if (horizontalDirection && horizontalDirection !== previousHorizontal) {
    return horizontalDirection;
  }
  if (verticalDirection && verticalDirection !== previousVertical) {
    return verticalDirection;
  }
  return null;
}

function axisDirection(value, negativeDirection, positiveDirection) {
  if (value < -0.55) return negativeDirection;
  if (value > 0.55) return positiveDirection;
  return null;
}

function buttonJustPressed(gamepad, buttonIndex) {
  const pressed = isPressed(gamepad, buttonIndex);
  const key = `${gamepad.index}:${buttonIndex}`;
  const wasPressed = lastButtonState.get(key) || false;
  lastButtonState.set(key, pressed);
  return pressed && !wasPressed;
}

function updateButtonSnapshot(gamepad) {
  gamepad.buttons.forEach((button, i) => {
    lastButtonState.set(`${gamepad.index}:${i}`, button.pressed);
  });
}

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

// ── Init ──────────────────────────────────────────────────────────────────
loadTheme();
loadTileAlpha();
loadSavedBackground();
loadBackgrounds();
loadApps().catch((error) => showToast(error.message, true));
pollGamepad();
fetchDiagnostics();
setInterval(fetchDiagnostics, 10_000);
