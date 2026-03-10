# City Simulator Desktop

Procedural 3D City Simulator — a cross-platform desktop application that transforms OpenStreetMap data into interactive, navigable 3D urban environments with real-time agent simulation.

![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron)
![Three.js](https://img.shields.io/badge/Three.js-r183-black?logo=three.js)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python)

---

## Prerequisites

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 20+ (LTS recommended) | [nodejs.org](https://nodejs.org/) |
| **npm** | 9+ (included with Node.js) | — |
| **Python** | 3.11+ | [python.org](https://www.python.org/downloads/) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/) |

> **Windows users:** During Python installation, make sure to check **"Add Python to PATH"**.

---

## Setup (New Device)

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/city-simulator-desktop.git
cd city-simulator-desktop
```

### 2. Install Node.js Dependencies

This installs the Electron shell, build tools, **and** automatically installs the renderer (React/Three.js) sub-package via the `postinstall` script.

```bash
npm install
```

### 3. Set Up the Python Sidecar

The Python backend handles OpenStreetMap data fetching, normalization, and caching.

**Option A — Using a Virtual Environment (Recommended):**

```bash
cd python-sidecar

# Create a virtual environment
python -m venv .venv

# Activate it
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Windows (CMD):
.venv\Scripts\activate.bat
# macOS / Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

cd ..
```

**Option B — Global Install (not recommended):**

```bash
cd python-sidecar
pip install -r requirements.txt
cd ..
```

### 4. (Optional) Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if you need to override defaults:
- `PYTHON_PATH` — Path to Python executable (default: `python`, auto-detected from `.venv`)
- `SIDECAR_PORT` — Port for the FastAPI backend (default: `auto`)

---

## Running the App

```bash
npm run dev
```

This runs three things concurrently:
1. **Vite dev server** — React/Three.js renderer on `http://localhost:5173`
2. **Electron** — Desktop window that loads the Vite dev server
3. **Python sidecar** — FastAPI backend (auto-spawned by Electron on a random port)

> **First launch:** Search for any city (e.g., "Mumbai" or "Tokyo"). The Overpass API query may take 20–60 seconds on first load. Subsequent loads use the local SQLite cache.

---

## Project Structure

```
city-simulator-desktop/
├── electron/                  # Electron main process
│   ├── main.js               # App entry point, window management
│   ├── sidecar/              # Python sidecar lifecycle (spawn, health, kill)
│   ├── ipc/                  # IPC bridge handlers
│   └── utils/                # Logger, file helpers
├── renderer/                  # React + Three.js frontend
│   ├── src/
│   │   ├── components/       # React UI components
│   │   │   ├── scene/        # CityScene.jsx — main 3D viewport
│   │   │   ├── ui/           # HUD, toggles, panels, modals
│   │   │   └── layout/       # App shell, sidebar
│   │   ├── three/            # Three.js geometry modules
│   │   │   ├── buildingGeometry.js
│   │   │   ├── roadGeometry.js
│   │   │   ├── waterGeometry.js
│   │   │   ├── zoneGeometry.js      # Phase 3: Landuse/Zoning
│   │   │   ├── railGeometry.js      # Phase 3: Railway tracks
│   │   │   ├── amenityGeometry.js
│   │   │   ├── dayNightCycle.js
│   │   │   ├── vehicleAgents.js
│   │   │   ├── pedestrianAgents.js
│   │   │   ├── heatmapLayer.js
│   │   │   └── lodManager.js
│   │   └── store/            # Zustand state management
│   └── package.json
├── python-sidecar/            # Python FastAPI backend
│   ├── app/
│   │   ├── api/              # REST endpoints (/city, /health, /cache)
│   │   ├── services/         # Overpass client, schema normalizer, spatial processor
│   │   ├── db/               # SQLite cache layer
│   │   ├── schemas/          # Pydantic models
│   │   └── core/             # Config, logger
│   ├── requirements.txt
│   └── .venv/                # Virtual environment (created by you)
├── build/                     # electron-builder config
├── docs/                      # Phase documentation & architecture
├── package.json               # Root package (Electron + scripts)
└── README.md
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Main Process                     │
│  ┌──────────┐   ┌──────────────┐   ┌───────────────────┐   │
│  │  Window   │   │  IPC Bridge  │   │  Sidecar Manager  │   │
│  │ Manager   │   │  (handlers)  │   │  (spawn/health)   │   │
│  └──────────┘   └──────┬───────┘   └────────┬──────────┘   │
└──────────────────────── │ ────────────────── │ ─────────────┘
                          │ IPC                │ HTTP/REST
┌─────────────────────────▼──┐   ┌────────────▼──────────────┐
│   Renderer (Chromium)       │   │   Python FastAPI Sidecar   │
│                             │   │                            │
│  React 18 + Zustand 5       │   │  Overpass API Client       │
│  Three.js r183 (WebGL)      │   │  Schema Normalizer         │
│  Vite 6 (HMR)               │   │  Spatial Projector         │
│                             │   │  SQLite Cache (aiosqlite)  │
│  Layers:                    │   │                            │
│  • Buildings (BatchedMesh)  │   │  Endpoints:                │
│  • Roads (ribbon strips)    │   │  GET  /health              │
│  • Water (polygons+ribbons) │   │  GET  /city?bbox=...       │
│  • Zoning (merged patches)  │   │  GET  /city/cache          │
│  • Railways (ballast+rails) │   │  DELETE /city/cache/:id    │
│  • Amenities (icosahedrons) │   │  WS   /city/ws             │
│  • Heatmap (Viridis grid)   │   │                            │
│                             │   │                            │
│  Simulation:                │   │                            │
│  • Vehicle agents           │   │                            │
│  • Pedestrian agents        │   │                            │
│  • Day/Night cycle          │   │                            │
│  • LOD (4-tier)             │   │                            │
└─────────────────────────────┘   └────────────────────────────┘
```

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start full dev environment (Vite + Electron + Python) |
| `npm run build` | Build production bundle + Electron installer |
| `npm run lint` | Run ESLint on the entire codebase |
| `npm start` | Launch Electron from pre-built renderer |
| `cd renderer && npm test` | Run Vitest unit tests |

---

## Key Features

### Data Pipeline
- **OpenStreetMap** data via Overpass API
- Automatic **schema normalization** (buildings, roads, water, railways, zoning, amenities)
- **Local SQLite cache** with 48-hour TTL
- **Async processing** — all heavy parsing runs in background threads

### 3D Rendering
- Real polygon **building extrusion** from OSM footprints
- Color-coded **road ribbons** by highway classification
- **Water bodies** (lakes as polygons, rivers as ribbons)
- **Urban zoning** overlays (residential, commercial, industrial)
- **Railway networks** with dual-rail steel tracks on gravel ballast
- **Amenity markers** as glowing icosahedrons
- **Density heatmap** with Viridis color scale

### Simulation
- **Vehicle traffic** following road networks
- **Pedestrian agents** on sidewalks
- **Day/night cycle** with dynamic lighting
- Play/pause and speed controls (1×, 2×, 5×, 10×)

### UI
- **Layer toggles** — show/hide buildings, roads, water, railways, zones, amenities, heatmap
- **Entity selection** — click any object for metadata panel
- **Camera presets** — top-down, isometric, street-level
- **Screenshot export** — 1×, 2×, 4K resolution with native save dialog
- **City search** — geocoded search bar
- **Cache manager** — view/delete cached cities

---

## Troubleshooting

### Python sidecar won't start
```
[error] Sidecar health check timed out
```
- Ensure Python is installed and on your PATH: `python --version`
- Ensure the `.venv` exists inside `python-sidecar/` (see Setup Step 3)
- Check that all pip packages installed correctly: `pip list`

### City load fails with "fetch failed"
- The Overpass API may be rate-limited or down — try again in 30 seconds
- Check your internet connection
- Clear the cache from the app's cache manager and retry

### UI freezes during load
- Large cities (100k+ features) take 15-30 seconds to construct geometry
- The loading modal should remain visible during this time
- This is normal for cities like New York or Tokyo

### "BatchedMesh: All geometries must consistently have index"
- This was fixed in the latest version. Pull the latest code and restart.

---

## Documentation

See the [docs/](docs/) folder for detailed documentation:

- [Development Setup](docs/DEVELOPMENT_SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API_REFERENCE.md)
- [IPC Reference](docs/IPC_REFERENCE.md)
- [Debugging](docs/DEBUGGING.md)
- [Phase 1 — Scaffolding](docs/PHASE_1_SCAFFOLDING.md)
- [Phase 2 — Data Ingestion](docs/PHASE_2_DATA_INGESTION.md)
- [Phase 3 — 3D Rendering](docs/PHASE_3_3D_RENDERING.md)
- [Phase 4 — Agent Simulation](docs/PHASE_4_AGENT_SIMULATION.md)
- [Phase 5 — Polish & Release](docs/PHASE_5_POLISH_RELEASE.md)
- [Phase 6 — Terrain](docs/PHASE_6_TERRAIN.md)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron 33 |
| UI Framework | React 18 |
| 3D Engine | Three.js r183 |
| State Management | Zustand 5 |
| Bundler | Vite 6 |
| Backend | Python 3.12, FastAPI |
| HTTP Client | httpx |
| Database | SQLite (aiosqlite) |
| Build & Release | electron-builder 25 |
| Auto-update | electron-updater |
| CI/CD | GitHub Actions |
| Testing | Vitest + Testing Library |

---

## License

MIT
