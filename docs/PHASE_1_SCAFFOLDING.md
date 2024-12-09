# Phase 1 — Project Scaffolding

**Status**: ✅ Complete  
**Date**: February 2026

## Objective

Set up the monorepo structure with three independent layers that communicate via well-defined interfaces:
1. **Electron main process** — desktop shell, window management, IPC routing
2. **React renderer** — UI components, state management, 3D viewport
3. **Python sidecar** — data processing, API client, database

## What Was Built

### Electron Main Process (`electron/`)

| File | Purpose |
|------|---------|
| `main.js` | App entry point. Creates BrowserWindow (frameless, 1280×800), spawns Python sidecar, registers IPC handlers, manages lifecycle |
| `preload.js` | Exposes `window.electronAPI` via `contextBridge`. Defines IPC methods for renderer ↔ main communication |
| `sidecar/spawnPython.js` | Manages Python child process: finds free port, generates auth token, spawns with `.venv` Python, handles restarts, health polling |
| `ipc/cityHandlers.js` | Registers `ipcMain.handle` for city operations (load, cache list, cache delete) |
| `window/windowControls.js` | Custom frameless window controls (minimize, maximize, close) |

**Key Design Decisions**:
- `nodeIntegration: false` + `contextIsolation: true` for security
- Auth token generated per session (UUID), passed to sidecar via env
- Sidecar port is dynamically assigned (finds free port)
- BrowserWindow loads from `localhost:5173` in dev, `dist/index.html` in production
- CSP headers configured to allow Nominatim and Overpass API calls

### React Renderer (`renderer/`)

| File | Purpose |
|------|---------|
| `src/App.jsx` | Root component, mounts AppShell |
| `src/App.css` | Global styles — dark theme, glassmorphism, animations |
| `src/components/layout/AppShell.jsx` | Main layout: title bar, HUD overlay, 3D viewport, status bar |
| `src/store/cityStore.js` | Zustand store for city data, loading state, cache management |

**Key Design Decisions**:
- Vite 6 for fast dev server + HMR
- Zustand (not Redux) for minimal boilerplate state management
- Custom CSS (no Tailwind) for full control over the dark/glassmorphism aesthetic
- All Electron API calls go through `window.electronAPI` (never `require`)

### Python Sidecar (`python-sidecar/`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI app creation, CORS, lifespan (DB init) |
| `app/core/config.py` | Pydantic settings (port, auth token, data dir) |
| `app/core/logger.py` | Structured logging with timestamps |
| `app/api/health.py` | `GET /health` endpoint for sidecar status |

**Key Design Decisions**:
- FastAPI chosen for async support + automatic OpenAPI docs
- Pydantic settings for typed configuration
- Python virtual environment (`.venv`) for isolated dependencies
- Auth via Bearer token in request headers

### Root Project

| File | Purpose |
|------|---------|
| `package.json` | Root npm scripts: `dev` uses `concurrently` to run renderer + electron |
| `.env.example` | Environment variable template |
| `.gitignore` | Ignores `node_modules`, `.venv`, `dist`, `*.db`, `__pycache__` |

## Dependencies Installed

**Node.js (root)**:
- `electron` — desktop framework
- `concurrently` — run renderer + electron simultaneously
- `wait-on` — wait for Vite server before launching Electron

**Node.js (renderer)**:
- `react`, `react-dom` — UI framework
- `vite`, `@vitejs/plugin-react` — build tool
- `zustand` — state management

**Python**:
- `fastapi` — web framework
- `uvicorn` — ASGI server
- `pydantic-settings` — config management
