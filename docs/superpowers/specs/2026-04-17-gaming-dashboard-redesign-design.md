# Gaming Dashboard Redesign — Design Spec
**Date:** 2026-04-17

## Overview

Redesign the SuperDeck launcher UI from its current minimal dark style to a "Gaming Dashboard" aesthetic — bold, electric, Xbox/PlayStation-inspired with neon accents, glow effects, and high contrast. Add a Settings page (accessed via a topbar gear button) with three sections: Appearance (theme/colors), Startup behavior, and System Info.

---

## Visual Style

- **Background:** Near-black (`#080b0f`) with a subtle CSS grid overlay (low-opacity cyan lines at 60px intervals)
- **Primary accent:** Cyan (`#00d4ff`) — used for Media category tiles, active states, focus glows
- **Secondary accent:** Purple (`#a78bfa`) — used for Games category tiles
- **Status green:** `#00ff88` — used for the online/ready indicator dot
- **Typography:** System sans-serif, heavy weights (700–900), wide letter-spacing for labels
- **Tile focus state:** Colored border + outer glow box-shadow + corner bracket accent + `translateY(-4px)` lift
- **Corner decorations:** Thin L-shaped borders in top-left (cyan) and bottom-right (purple) corners
- **Scanline overlay:** Faint repeating gradient for CRT texture (optional, very subtle)
- **Theming:** All accent colors driven by CSS custom properties (`--accent-primary`, `--accent-secondary`, `--glow-primary`, `--glow-secondary`) so the entire palette swaps by updating four variables

---

## Architecture

Single-page application. No new backend routes.

`<body>` carries a `data-view` attribute (`"launcher"` or `"settings"`). CSS uses `[data-view="settings"] .launcher-view { display: none }` etc. to show/hide views. JS calls `switchView(name)` to toggle.

Gamepad and keyboard navigation are scoped to the active view — the launcher grid handler only fires when `data-view="launcher"`, the settings handler only fires when `data-view="settings"`.

---

## Components

### Topbar
- Left: eyebrow label ("Local Console") + `<h1>Media<span>Server</span></h1>` with cyan `<span>`
- Right: status badge (animated dot + text) + gear button (`⚙`, `id="settings-btn"`)
- Gear button opens/closes settings view. Keyboard shortcut: `S` key (when launcher is active). Gamepad: Select button (index 8). ESC or gear button again closes settings.

### Launcher View
- Apps grouped by category, each group has a colored section label with a fading rule line
- Grid of tiles: `repeat(auto-fit, minmax(220px, 1fr))`
- Tile structure: category tag (top) + app name (large, bold) + description (bottom, muted)
- Focused tile: colored border, glow, corner bracket, slight lift
- Category "Media" uses primary accent; "Games" uses secondary accent; other categories fall back to primary accent

### Settings View
Two-column layout: 220px sidebar nav + flex-1 panel area.

**Sidebar nav items:**
1. 🎨 Appearance
2. 🚀 Startup
3. 🖥 System Info

Active nav item: primary-accent background tint + colored border + colored text.

**Appearance panel:**
- *Color Theme* — four preset swatches: Cyan, Purple, Green, Amber. Clicking a swatch writes the preset's CSS var values to `:root` and saves `{ theme: "cyan" }` to `localStorage`.
- *Custom Colors* — two `<input type="color">` pickers labeled "Primary accent" and "Secondary accent". On `input` event, update CSS vars live and save `{ theme: "custom", primary: "#...", secondary: "#..." }` to `localStorage`. The glow vars derive from the accent colors at 40% opacity.

**Startup panel:**
- Label: "Auto-launch on startup"
- Description: "Automatically open an app when SuperDeck loads"
- Grid of selectable app tiles (same style as launcher tiles, smaller) + a "None" option
- Selection stored in `localStorage` as `{ startupAppId: "jellyfin" | null }`
- On `loadApps()`, after rendering the grid, if `startupAppId` is set and matches a loaded app, call `launchApp(id)` automatically

**System Info panel:**
- Fetched from `/api/session`, `/api/dependencies`, `/api/services` when this tab is opened (lazy, not on page load)
- Three sub-sections rendered as labeled rows with status indicators:
  - *Session* — display/wayland vars, has_graphical_session (green tick / red cross)
  - *Dependencies* — table of name + installed (tick/cross) + path
  - *Services* — Jellyfin installed/active/reachable status with URL

---

## Data Flow

```
localStorage ──► applyTheme() ──► CSS :root vars ──► entire UI updates

loadApps() ──► /api/apps ──► renderApps()
           └──► localStorage.startupAppId ──► launchApp() if match

settings gear / S key ──► switchView("settings")
ESC / gear again       ──► switchView("launcher")

system-info tab click ──► fetch /api/session + /api/dependencies + /api/services ──► renderSystemInfo()
```

---

## Keyboard & Gamepad Navigation

### Launcher (unchanged from current behavior)
- Arrow keys / D-pad: move focus between tiles
- Enter / A button: launch focused app
- ESC / B button: reset focus to index 0
- `S` key / Select button (8): open settings

### Settings
- Arrow Up/Down / D-pad up/down: move between sidebar nav items
- Enter / A button: confirm (activate nav item, or interact with focused control)
- ESC / B button / gear button: close settings, return to launcher
- Tab / Arrow Left-Right: move between controls within a panel (theme swatches, color pickers, startup tiles)

---

## Files Changed

| File | Change |
|------|--------|
| `mediaserver/static/index.html` | Add settings view markup, gear button in topbar, restructure into launcher/settings sections |
| `mediaserver/static/styles.css` | Full overhaul: gaming dashboard aesthetic, CSS custom property theming, settings layout |
| `mediaserver/static/app.js` | Add: `switchView()`, `applyTheme()`, `loadTheme()`, settings nav handler, startup auto-launch, system info fetcher |

No backend changes required.

---

## Theme Presets

| Name   | `--accent-primary` | `--accent-secondary` |
|--------|--------------------|----------------------|
| Cyan   | `#00d4ff`          | `#a78bfa`            |
| Purple | `#a78bfa`          | `#f472b6`            |
| Green  | `#00ff88`          | `#00d4ff`            |
| Amber  | `#fbbf24`          | `#f97316`            |

---

## Out of Scope

- App management (add/remove apps) — config is YAML-based; a future spec
- Display options (grid columns, tile size) — not requested
- Backend persistence for theme/startup — localStorage is sufficient for a single-user kiosk
