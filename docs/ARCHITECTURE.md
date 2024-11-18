# Architecture Overview

## System Design

The City Simulator is a **desktop application** built on a three-tier architecture:

```
┌─────────────────────────────────────────────────────┐
│                   Electron (Main)                    │
│  • Window management (frameless, custom controls)    │
│  • IPC bridge between renderer ↔ sidecar            │
│  • Python sidecar lifecycle management               │
│  • Auth token + port management                      │
└──────────┬───────────────────────────┬──────────────┘
           │ IPC (contextBridge)       │ HTTP (localhost)
           ▼                           ▼
┌──────────────────────┐  ┌────────────────────────────┐
│   React Renderer     │  │     Python Sidecar          │
│  (Vite + Three.js)   │  │     (FastAPI + uvicorn)     │
│                      │  │                             │
│  • CitySearchBar     │  │  • Overpass API client      │
│  • CityScene (3D)    │  │  • Schema normalizer        │
│  • AppShell + HUD    │  │  • Spatial processor         │
│  • Zustand store     │  │  • SQLite cache (aiosqlite)  │
│  • OrbitControls     │  │  • GeoJSON projection        │
└──────────────────────┘  └────────────────────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop Shell** | Electron 33 | Desktop app wrapper, window controls, IPC |
| **Renderer** | React 18 + Vite 6 | UI components, state management |
| **3D Engine** | Three.js r183 | WebGL rendering, geometry, camera, simulation |
| **State** | Zustand | Lightweight reactive state store |
| **Backend** | Python 3.12 + FastAPI | Data processing sidecar |
| **HTTP Server** | Uvicorn | ASGI server for FastAPI |
| **Database** | SQLite + aiosqlite | Local caching of city data |
| **APIs** | Overpass API, Nominatim | OpenStreetMap data + geocoding |

## Data Flow

```
User searches "Colaba, Mumbai"
        │
        ▼
┌─ CitySearchBar ─────────────────────┐
│  1. Geocode via Nominatim API        │
│  2. Get bounding box                 │
│  3. Auto-crop if > 20 km²           │
│  4. Call loadCity(bbox) via IPC      │
└──────────┬───────────────────────────┘
           │ ipcRenderer.invoke('city:load')
           ▼
┌─ Main Process (cityHandlers.js) ────┐
│  5. Forward to Python sidecar       │
│     GET /city?bbox=N,S,E,W          │
│     with auth token (auto-retry)    │
│     (90s timeout)                   │
└──────────┬───────────────────────────┘
           │ HTTP fetch to localhost
           ▼
┌─ Python Sidecar ────────────────────┐
│  6. Check SQLite cache              │
│  7. If miss → query Overpass API    │
│  8. Normalize raw JSON → GeoJSON    │
│     (schema_normalizer.py)          │
│  9. Project WGS84 → Cartesian      │
│     (spatial_processor.py)          │
│  10. Cache in SQLite                │
│  11. Return GeoJSON to Electron     │
└──────────┬───────────────────────────┘
           │ JSON response
           ▼
┌─ React Renderer ────────────────────┐
│  12. Store in Zustand (cityStore)   │
│  13. CityScene detects new data     │
│  14. Build Three.js geometry:       │
│      • Buildings → ExtrudeGeometry  │
│      • Roads → merged ribbons       │
│      • Amenities → InstancedMesh    │
│  15. Spawn simulation agents:       │
│      • Vehicles (A* pathfinding)    │
│      • Pedestrians (spatial grid)   │
│  16. Auto-fit camera to city bounds │
│  17. Render at 60fps                │
└──────────────────────────────────────┘
```

## Directory Structure

```
city-simulator-desktop/
├── eslint.config.mjs         # ESLint v9 flat config
├── package.json              # Root package (concurrently, electron)
│
├── electron/                  # Electron main process
│   ├── main.js               # App entry, window creation, navigation guards
│   ├── preload.js            # contextBridge IPC API
│   ├── sidecar/
│   │   ├── spawnPython.js    # Python process manager (auto-restart, health)
│   │   └── portManager.js    # Dynamic port allocation
│   ├── ipc/
│   │   ├── cityHandlers.js   # City IPC handlers (with retry)
│   │   ├── fileHandlers.js   # File import/export
│   │   └── simulationHandlers.js  # Simulation menu actions
│   ├── menu/
│   │   └── appMenu.js        # Native menu bar
│   └── utils/
│       └── logger.js         # Electron-side logging
│
├── renderer/                  # React frontend (Vite)
│   ├── vite.config.js        # Vite + test config + code splitting
│   ├── src/
│   │   ├── main.jsx          # React entry (renders AppShell)
│   │   ├── App.css           # Global styles
│   │   ├── bridge/
│   │   │   └── ipc.js        # Renderer-side IPC wrapper
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppShell.jsx     # Main layout + HUD + lazy CityScene
│   │   │   │   └── TitleBar.jsx     # Custom frameless title bar
│   │   │   ├── scene/
│   │   │   │   └── CityScene.jsx    # Three.js viewport + simulation loop
│   │   │   └── ui/
│   │   │       ├── Icons.jsx          # SVG icon components
│   │   │       ├── CitySearchBar.jsx  # Search + geocoding
│   │   │       ├── ProgressModal.jsx  # Loading progress overlay
│   │   │       ├── CacheManager.jsx   # Cache CRUD panel
│   │   │       ├── LayerToggles.jsx   # Building/road/amenity/heatmap toggles
│   │   │       ├── SimulationControls.jsx # Play/pause, speed, time, agents
│   │   │       ├── CameraPresets.jsx  # Named camera angles
│   │   │       ├── EntityInfoPanel.jsx  # Selected entity details
│   │   │       ├── ScreenshotExport.jsx # PNG/WebP screenshot capture
│   │   │       └── UpdateNotice.jsx   # Auto-updater UI
│   │   ├── three/
│   │   │   ├── buildingGeometry.js    # Polygon extrusion (ExtrudeGeometry)
│   │   │   ├── roadGeometry.js        # Merged road ribbons (mergeGeometries)
│   │   │   ├── roadGraph.js           # A* pathfinding graph
│   │   │   ├── amenityGeometry.js     # Amenity marker builder
│   │   │   ├── vehicleAgents.js       # Vehicles (A* route following)
│   │   │   ├── pedestrianAgents.js    # Pedestrians (spatial hash grid)
│   │   │   ├── dayNightCycle.js       # Sun/ambient/sky animation
│   │   │   ├── heatmapLayer.js        # Density heatmap overlay
│   │   │   └── lodManager.js          # LOD distance culling
│   │   ├── store/
│   │   │   └── cityStore.js           # Zustand state
│   │   └── __tests__/                 # Vitest test suite
│   │       ├── setup.js               # Test mocks (electronAPI, RAF, etc.)
│   │       ├── store/
│   │       │   └── cityStore.test.js
│   │       ├── three/
│   │       │   ├── roadGraph.test.js
│   │       │   └── buildingGeometry.test.js
│   │       └── components/
│   │           ├── LayerToggles.test.jsx
│   │           └── SimulationControls.test.jsx
│   └── dist/                  # Build output (code-split chunks)
│
├── python-sidecar/            # Python backend
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py           # FastAPI app entry
│   │   ├── api/
│   │   │   ├── city.py       # City endpoints (REST + WebSocket)
│   │   │   └── health.py     # Health check
│   │   ├── core/
│   │   │   ├── config.py     # Settings (pydantic)
│   │   │   └── logger.py     # Structured logging
│   │   ├── db/
│   │   │   └── database.py   # SQLite cache layer
│   │   ├── schemas/
│   │   │   └── city.py       # Pydantic models (BBox, etc.)
│   │   └── services/
│   │       ├── overpass_client.py    # Overpass API client
│   │       ├── schema_normalizer.py # Raw → GeoJSON
│   │       └── spatial_processor.py # WGS84 → Cartesian
│   ├── scripts/
│   │   └── inspect_cache.py  # Diagnostic: inspect SQLite cache
│   └── tests/
│       └── test_api.py       # Integration smoke tests
│
├── build/                    # Electron Builder config
│   └── electron-builder.yml
│
└── docs/                     # Documentation
    ├── README.md
    ├── API_REFERENCE.md
    ├── ARCHITECTURE.md       # ← you are here
    ├── DEVELOPMENT_SETUP.md
    ├── DEBUGGING.md
    ├── IPC_REFERENCE.md
    └── PHASE_*.md            # Phase delivery docs
```

## Security Model

- **Node Integration**: Disabled (`nodeIntegration: false`)
- **Context Isolation**: Enabled (`contextIsolation: true`)
- **Preload Script**: Only exposes specific IPC methods via `contextBridge`
- **Sidecar Auth**: Bearer token generated per session, shared via IPC
- **CSP**: Content Security Policy allows Nominatim/Overpass API calls
- **No Remote Code**: All code runs locally; no remote module loading
