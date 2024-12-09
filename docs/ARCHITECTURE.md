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
| **3D Engine** | Three.js (r170+) | WebGL rendering, geometry, camera |
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
│     POST /city                      │
│     with bbox + auth token          │
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
│      • Buildings → BoxGeometry      │
│      • Roads → BufferGeometry       │
│      • Amenities → InstancedMesh    │
│  15. Auto-fit camera to city bounds │
│  16. Render at 60fps                │
└──────────────────────────────────────┘
```

## Directory Structure

```
city-simulator-desktop/
├── electron/                  # Electron main process
│   ├── main.js               # App entry, window creation
│   ├── preload.js            # contextBridge IPC API
│   ├── sidecar/
│   │   └── spawnPython.js    # Python process manager
│   ├── ipc/
│   │   └── cityHandlers.js   # IPC handler registration
│   └── window/
│       └── windowControls.js # Frameless window controls
│
├── renderer/                  # React frontend (Vite)
│   ├── src/
│   │   ├── App.jsx           # Root component
│   │   ├── App.css           # Global styles
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── AppShell.jsx     # Main layout + HUD
│   │   │   ├── scene/
│   │   │   │   └── CityScene.jsx    # Three.js viewport
│   │   │   └── ui/
│   │   │       ├── CitySearchBar.jsx  # Search + geocoding
│   │   │       ├── ProgressModal.jsx  # Loading progress
│   │   │       └── CacheManager.jsx   # Cache CRUD
│   │   ├── three/
│   │   │   ├── buildingGeometry.js    # Building mesh builder
│   │   │   ├── roadGeometry.js        # Road ribbon builder
│   │   │   └── amenityGeometry.js     # Amenity marker builder
│   │   └── store/
│   │       └── cityStore.js           # Zustand state
│   └── vite.config.js
│
├── python-sidecar/            # Python backend
│   ├── app/
│   │   ├── main.py           # FastAPI app entry
│   │   ├── api/
│   │   │   ├── city.py       # City endpoints
│   │   │   └── health.py     # Health check
│   │   ├── core/
│   │   │   ├── config.py     # Settings (pydantic)
│   │   │   └── logger.py     # Structured logging
│   │   ├── db/
│   │   │   └── database.py   # SQLite cache layer
│   │   ├── schemas/
│   │   │   └── city.py       # Pydantic models
│   │   └── services/
│   │       ├── overpass_client.py    # Overpass API client
│   │       ├── schema_normalizer.py # Raw → GeoJSON
│   │       └── spatial_processor.py # WGS84 → Cartesian
│   ├── requirements.txt
│   └── .venv/                # Python virtual environment
│
├── docs/                     # Documentation (you are here)
├── package.json              # Root package (concurrently)
└── .env.example              # Environment template
```

## Security Model

- **Node Integration**: Disabled (`nodeIntegration: false`)
- **Context Isolation**: Enabled (`contextIsolation: true`)
- **Preload Script**: Only exposes specific IPC methods via `contextBridge`
- **Sidecar Auth**: Bearer token generated per session, shared via IPC
- **CSP**: Content Security Policy allows Nominatim/Overpass API calls
- **No Remote Code**: All code runs locally; no remote module loading
