# Phase 5 — Polish & Release

> **Status:** ✅ Complete

## Overview

Phase 5 finalizes the City Simulator Desktop app for distribution. It adds visual
overlays, file I/O, performance optimizations, auto-update support, and cross-platform
release packaging.

---

## Features Implemented

### 5.1 Density Heatmap

| File | Purpose |
|------|---------|
| `renderer/src/three/heatmapLayer.js` | `HeatmapLayer` class |

- 40×40 grid overlaid on the ground plane
- Counts all features per cell, normalizes with gamma 0.6 correction
- Viridis color scale (purple → blue → green → yellow)
- Merged `BufferGeometry` with vertex colors for performance (single draw call)
- 3D floating legend bar with labels
- Toggled via the 🌡️ button in `LayerToggles`

### 5.2 Level-of-Detail (LOD)

| File | Purpose |
|------|---------|
| `renderer/src/three/lodManager.js` | `LODManager` class |

Four distance-based tiers updated every 500 ms:

| Tier | Distance | Effect |
|------|----------|--------|
| Near | < 200 m | Full detail (edges + shadows) |
| Mid | 200–600 m | Hide edge helpers |
| Far | 600–1200 m | Disable shadow casting |
| VeryFar | > 1200 m | Hide buildings < 8 m tall |

### 5.3 File Save / Load

| File | Purpose |
|------|---------|
| `electron/ipc/fileHandlers.js` | `file:export`, `file:open`, `file:screenshot` IPC handlers |

- **Export:** `.city` (JSON wrapper with metadata) or `.geojson`
- **Open:** Detects format by extension, parses, returns normalized data
- **Screenshot:** Accepts base64 data URL, writes PNG via native save dialog
- OS file association registered in `electron-builder.yml` for `.city` extension
- Menu item: **File → Open File…** (`Ctrl+O`)

### 5.4 Screenshot Export

| File | Purpose |
|------|---------|
| `renderer/src/components/ui/ScreenshotExport.jsx` | UI component |

- Resolution menu: 1×, 2× (HiDPI), 4K
- Temporarily resizes the WebGL renderer, captures `toDataURL('image/png')`, restores
- Renderer restore is in `catch` block to prevent corrupted canvas on error
- Saves via IPC native dialog with fallback to `<a download>` link

### 5.5 Auto-Updater

| File | Purpose |
|------|---------|
| `electron/utils/autoUpdater.js` | Main process update logic |
| `renderer/src/components/ui/UpdateNotice.jsx` | Renderer UI banner |

- Uses `electron-updater` with GitHub Releases as publish provider
- `autoDownload: false` — user initiates download explicitly
- IPC channels: `update:check`, `update:download`, `update:install`
- Preload exposes: `downloadUpdate()`, `installUpdate()`, `onUpdateProgress()`, `onUpdateReady()`
- Checks for updates 10 s after startup (non-blocking)
- Banner shows version, download progress bar, install & restart button

### 5.6 CI/CD Pipeline

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | GitHub Actions workflow |

- Triggered on version tags (`v*`)
- Matrix build: Windows, macOS, Linux
- Steps: checkout → Node 20 → Python 3.12 → install deps → build renderer → electron-builder → upload artifacts
- Publishes to GitHub Releases via `--publish always`

### 5.7 Release Packaging

| File | Purpose |
|------|---------|
| `build/electron-builder.yml` | Build configuration |
| `build/icons/icon.png` | App icon (256×256 PNG) |
| `build/icons/icon.ico` | Windows icon |
| `build/icons/icon.icns` | macOS icon placeholder |

Targets:
- **Windows:** NSIS installer (x64)
- **macOS:** DMG (x64 + arm64)
- **Linux:** AppImage + .deb (x64)

Python sidecar is bundled via `extraResources` with `__pycache__` filtered out.

---

## Code Cleanup

- Removed `console.log` from `buildingGeometry.js`, `roadGeometry.js`
- Removed `console.error` from `cityStore.js` (replaced with `set({ error })` or silent catch)
- Removed unused `startLoading` import from `CitySearchBar.jsx`
- Removed dead `getSidecarToken` import/usage from `simulationHandlers.js`
- Fixed `UpdateNotice` to actually call IPC instead of non-existent `invoke()` 
- Fixed `ScreenshotExport` to restore renderer size in error path
- Dynamic version string via Vite `define` (`__APP_VERSION__` from `package.json`)

---

## Performance Notes

- Heatmap uses merged geometry → 1 draw call for entire overlay
- LOD reduces GPU load for distant buildings (shadow maps, edge lines)
- Throttled LOD updates (every 500 ms, not every frame)
- `InstancedMesh` used for vehicles/pedestrians/amenities (Phase 3–4)
- `requestAnimationFrame` loop with delta-time for consistent simulation speed

---

## Build & Release Workflow

```bash
# Local development
npm run dev

# Build renderer + package for current OS
npm run build

# Release via CI/CD
git tag v1.0.0
git push origin v1.0.0
# → GitHub Actions builds Win/macOS/Linux installers
# → Published to GitHub Releases with auto-update metadata
```
