## 1. PROJECT OVERVIEW

The **City Simulator Desktop** is a cross-platform Electron application that transforms raw OpenStreetMap (OSM) data into interactive, 3D urban environments in real-time. It features a React/Three.js frontend for high-performance rendering and a Python/FastAPI sidecar engine for heavy geospatial processing. It is designed for urban planners, simulation enthusiasts, and developers needing a lightweight desktop tool to visualize and simulate city-scale data.

**Current Phase:** Phase 6 (Terrain Elevation Rendering is implemented; subsurface utilities and environment overlays are complete).

**Known Limitations & Constraints:**
- Depends heavily on the external Overpass API, which is subject to rate limiting and slow responses for large bounding boxes.
- Python sidecar requires available local ports and an installed Python environment (or packaged venv) to run.
- Bounding box limits are strictly enforced (0.01 km² to 150 km²) to prevent out-of-memory crashes during parsing.

## 2. FULL FILE TREE

```text
city-simulator-desktop/
├── electron/
│   ├── main.js                          [CRITICAL] App entry point, manages windows, sidecar, and IPC.
│   ├── preload.js                       [CONFIG] Context bridge exposing secure API to renderer.
│   ├── ipc/
│   │   ├── cityHandlers.js              [CRITICAL] Bridges renderer city requests to Python sidecar.
│   │   ├── fileHandlers.js              [CRITICAL] Handles saving/loading local files and screenshots.
│   │   └── simulationHandlers.js        [CRITICAL] Relays simulation events.
│   ├── menu/                            [CONFIG] Native application menu definitions.
│   ├── sidecar/
│   │   ├── portManager.js               [CONFIG] Finds dynamic free ports for the sidecar.
│   │   └── spawnPython.js               [CRITICAL] Manages Python process lifecycle, health checks, restarts.
│   └── utils/
│       ├── autoUpdater.js               [CONFIG] Manages OTA updates for packaged app.
│       └── logger.js                    [CONFIG] Global logging utility.
├── python-sidecar/
│   ├── app/
│   │   ├── main.py                      [CRITICAL] FastAPI entry point, configures middleware and routes.
│   │   ├── api/
│   │   │   ├── city.py                  [CRITICAL] Endpoints for querying/caching OSM data.
│   │   │   ├── health.py                [CRITICAL] Sidecar health check endpoint.
│   │   │   └── terrain.py               [CRITICAL] Endpoints for elevation grid fetching.
│   │   ├── core/
│   │   │   ├── config.py                [CONFIG] Pydantic settings management.
│   │   │   └── logger.py                [CONFIG] Python logging configuration.
│   │   ├── db/
│   │   │   └── database.py              [CRITICAL] SQLite wrapper for local city caching.
│   │   ├── schemas/
│   │   │   └── city.py                  [CONFIG] Pydantic models for request/response validation.
│   │   └── services/
│   │       ├── elevation_client.py      [CRITICAL] [INFERRED] Fetches terrain elevation data.
│   │       ├── overpass_client.py       [CRITICAL] Queries Overpass API with retry logic.
│   │       ├── schema_normalizer.py     [CRITICAL] Converts raw OSM tags into normalized GeoJSON.
│   │       └── spatial_processor.py     [CRITICAL] Reprojects lat/lon to local Cartesian coordinates.
├── renderer/
│   ├── index.html                       [CONFIG] Renderer entry point.
│   └── src/
│       ├── App.css                      [CONFIG] Global application styles.
│       ├── main.jsx                     [CRITICAL] React application bootstrapper.
│       ├── components/
│       │   ├── layout/
│       │   │   ├── AppShell.jsx         [CRITICAL] Main UI layout wrapper.
│       │   │   └── TitleBar.jsx         [CONFIG] Custom frameless window title bar.
│       │   ├── scene/
│       │   │   └── CityScene.jsx        [CRITICAL] Three.js canvas, orchestrates geometry rendering.
│       │   └── ui/
│       │       ├── CacheManager.jsx     [CRITICAL] UI for managing locally cached cities.
│       │       ├── CameraPresets.jsx    [CRITICAL] Pre-defined camera angles and bounds management.
│       │       ├── CitySearchBar.jsx    [CRITICAL] Search input triggering bbox city loads.
│       │       ├── EntityInfoPanel.jsx  [CRITICAL] Displays properties of selected 3D objects.
│       │       ├── Icons.jsx            [CONFIG] SVG icon repository.
│       │       ├── LayerToggles.jsx     [CRITICAL] Toggles visibility of city feature layers.
│       │       ├── ProgressModal.jsx    [CRITICAL] Displays ingestion/loading progress.
│       │       ├── ScreenshotExport.jsx [CRITICAL] Handles canvas screenshot capabilities.
│       │       ├── SimulationControls.jsx [CRITICAL] Time and speed controls for agents/environment.
│       │       └── UpdateNotice.jsx     [CONFIG] Auto-updater UI notification.
│       ├── store/
│       │   └── cityStore.js             [CRITICAL] Zustand store managing global application state.
│       └── three/
│           ├── buildingGeometry.js      [CRITICAL] Batches and renders 3D building meshes.
│           ├── roadGeometry.js          [CRITICAL] Merges and renders road ribbons.
│           ├── waterGeometry.js         [CRITICAL] Renders water bodies.
│           ├── zoneGeometry.js          [CRITICAL] Renders landuse/zoning areas.
│           ├── railGeometry.js          [CRITICAL] Renders railway lines.
│           ├── amenityGeometry.js       [CRITICAL] Renders point-of-interest markers.
│           ├── heatmapLayer.js          [CRITICAL] Renders spatial density heatmaps.
│           ├── vehicleAgents.js         [CRITICAL] Simulates traffic via InstancedMesh.
│           ├── pedestrianAgents.js      [CRITICAL] Simulates pedestrian agents.
│           ├── dayNightCycle.js         [CRITICAL] Animates lighting and sky colors.
│           ├── lodManager.js            [CRITICAL] Manages Level-of-Detail for performance.
│           ├── pipelineGeometry.js      [CRITICAL] Renders pipelines/utilities.
│           ├── roadGraph.js             [CRITICAL] [INFERRED] Graph data structure for pathfinding.
├── terrainGeometry.js       [CRITICAL] Renders elevation terrain.

│           ├── vegetationGeometry.js    [CRITICAL] Renders trees and parks.
│           ├── environmentSimulation.js [CRITICAL] Handles wind/AQI visual effects.
│           └── workers/
│               └── buildingWorker.js    [CRITICAL] [INFERRED] Web Worker offloading building mesh generation.
├── .env.example                         [CONFIG] Environment variables template.
└── package.json                         [CONFIG] Project dependencies and build scripts.
```

## 3. ARCHITECTURE DEEP DIVE

### Data Flow (City Loading)
1. **User Action:** User types a city name or bounding box into `CitySearchBar.jsx`.
2. **Store Update:** `useCityStore.loadCity(bbox)` is called.
3. **IPC Request:** Store invokes `window.electronAPI.loadCity(bbox)` (handled by `preload.js`).
4. **Main Process:** `cityHandlers.js` intercepts `city:load`. It uses `fetchWithRetry` to make an HTTP request to the Python sidecar running on localhost. If sidecar is dead, it auto-restarts it.
5. **Python API (`api/city.py`):** Receives the GET request with the bbox and Auth token.
6. **Cache Check:** Queries SQLite (`database.py`) to see if the bbox is already cached. If hit, returns immediately.
7. **Overpass Query:** If miss, `overpass_client.py` queries the Overpass API for raw OSM data.
8. **Normalization:** `schema_normalizer.py` converts raw nodes/ways/relations into a structured GeoJSON FeatureCollection, inferring default heights/widths.
9. **Projection:** `spatial_processor.py` projects lat/lon spherical coordinates into flat Cartesian coordinates centered around 0,0,0.
10. **Cache & Return:** Python saves the processed GeoJSON to SQLite and returns it over HTTP.
11. **Store Update:** Main process returns data to renderer. Zustand store updates `cityData`.
12. **Three.js Rendering (`CityScene.jsx`):** React effect reacts to `cityData`. It passes data to geometry factory functions (`roadGeometry`, `waterGeometry`, etc.). `buildingGeometry` is offloaded to a Web Worker (`buildingWorker.js`) to prevent blocking the UI thread.
13. **Display:** Meshes are added to the scene, camera is repositioned based on the calculated bounding box, and the simulation engines (vehicles, pedestrians, day/night) initialize.

### IPC Message Flow
| Channel Name | Direction | Payload Shape | Purpose |
|--------------|-----------|---------------|---------|
| `window:minimize/maximize/close` | Render → Main | None | Frameless window controls |
| `window:isMaximized` | Render ↔ Main | Boolean | Check window state |
| `sidecar:getInfo` | Render ↔ Main | `{port: number, token: string}` | Get Python connection details |
| `city:load` | Render ↔ Main | `{bbox: string}` → `{error: boolean, data?: object, message?: string}` | Fetch city GeoJSON |
| `city:cache:list` | Render ↔ Main | None → `Array<CacheEntry>` | Get list of downloaded cities |
| `city:cache:delete` | Render ↔ Main | `{cacheId: number}` → `boolean` | Delete local cache |
| `terrain:load` | Render ↔ Main | `{bbox: string, resolution: number}` → `{error: boolean, data?: object}` | Fetch elevation grid |
| `simulation:start` | Render ↔ Main | `{config: object}` | [INFERRED] Start backend simulation |
| `simulation:event` | Render ↔ Main | `{type: string, data: object}` | [INFERRED] Send interactive event |
| `file:export` | Render ↔ Main | `{format: string, data: object, cityName: string}` | Export city to disk |
| `file:open` | Render ↔ Main | None → `{data: object, cityName: string}` | Import city from disk |
| `file:screenshot` | Render ↔ Main | `{dataUrl: string, cityName: string}` | Save image to disk |
| `sidecar:status` | Main → Render | `{status: string, message: string}` | Broadcast engine state |
| `app:updateAvailable` | Main → Render | `object` | Notify of OTA update |
| `update:progress` | Main → Render | `{percent: number}` | Update download progress |

### WebSocket Protocol (`/ws/ingest`)
Used for streaming ingestion progress when loading large cities.
- **Client Sends:** `{"bbox": "N,S,E,W"}`
- **Server Streams:** `{"stage": "querying|processing|building_geometry|caching|complete", "percent": 0.0, "message": "string", "data": {...GeoJSON...} (only on complete)}`

### Python Sidecar Lifecycle
- **Startup:** Handled by `spawnPython.js` on app launch. Finds a dynamic free port, generates a secure random 32-byte auth token, and spawns the FastApi process via `child_process.spawn`.
- **Health Checks:** Electron polls `/health` every 5 seconds. If it fails 12 consecutive times (60s tolerance for long Overpass blocking queries), it kills the process and restarts it.
- **Auto-Restart:** Features exponential backoff (up to 5 restarts). Status broadcasts notify the React UI of "Engine crashed — restarting...".
- **Shutdown:** `app.on('before-quit')` catches Electron exit and gracefully sends SIGTERM to the Python process to prevent orphan processes.

## 4. MODULE REFERENCE

### electron/main.js
- **Purpose:** Entry point for the Electron app. Manages the main `BrowserWindow`, sets up IPC listeners, and orchestrates the Python sidecar lifecycle.
- **Exports:** None (Application entry).
- **Dependencies:** `electron`, `spawnPython.js`, `cityHandlers.js`, `simulationHandlers.js`, `fileHandlers.js`, `appMenu.js`, `autoUpdater.js`.
- **Side effects:** Modifies `process.env`, creates OS windows, spawns child processes, blocks external navigation.

### electron/sidecar/spawnPython.js
- **Purpose:** Reliable daemon management for the Python engine.
- **Exports:** `spawnSidecar`, `killSidecar`, `getSidecarPort`, `getSidecarToken`.
- **Dependencies:** `child_process`, `crypto`, `portManager.js`.
- **Key algorithms:** Exponential backoff for restarts, 60s tolerant health polling for blocking API calls.
- **How to modify safely:** When altering timeout thresholds, ensure they account for slow Overpass responses on low-end hardware.

### electron/ipc/cityHandlers.js
- **Purpose:** Bridges React store requests to the Python FastAPI backend.
- **Exports:** `registerCityHandlers`.
- **Key algorithms:** Wraps all API calls in `fetchWithRetry` which automatically attempts to reboot the sidecar if an `ECONNREFUSED` error occurs.

### electron/utils/
- **Purpose:** Utility functions for logging and OTA auto-updates via `electron-updater`.

### renderer/src/components/scene/CityScene.jsx
- **Purpose:** The core 3D viewport. Instantiates Three.js, manages the render loop, and coordinates all geometry factories.
- **Dependencies:** Three.js, Zustand `useCityStore`, all `three/*Geometry.js` modules.
- **Key algorithms:** Progressive chunked loading (using `yieldFrame` via `setTimeout(0)`) to prevent freezing the UI thread while adding complex geometries. Delegates building generation to a Web Worker. Raycasting for object selection/highlighting.
- **Side effects:** Heavy DOM mutation (canvas insertion), GPU memory allocation.
- **Known issues:** Resizing window while heavy geometry is generating might cause slight lag.

### renderer/src/components/ui/ & renderer/src/components/layout/
- **Purpose:** The React UI overlay for the application. Controls layers, search, cache, and displays info.
- **Key files:** `AppShell.jsx` (layout wrapper), `LayerToggles.jsx` (updates store visibility bools), `CitySearchBar.jsx` (triggers `loadCity`).

### renderer/src/three/buildingGeometry.js
- **Purpose:** Generates extruded 3D meshes for buildings.
- **Exports:** `createBuildingGroup`.
- **Key algorithms:** Uses `THREE.ExtrudeGeometry` for accurate footprints, falls back to `BoxGeometry` for degenerate polygons. Uses `THREE.BatchedMesh` to render tens of thousands of buildings in a single draw call. Validates geometry for NaN/Infinity to prevent bounding-box corruption.
- **How to modify safely:** Always ensure `geom.computeVertexNormals()` is called after setting index attributes if manually constructing BufferGeometries.

### renderer/src/three/roadGeometry.js
- **Purpose:** Renders road networks as flat ribbons.
- **Exports:** `createRoadGroup`.
- **Key algorithms:** Groups all roads of the same `highway_type` and merges their BufferGeometries into a single Mesh using `BufferGeometryUtils.mergeGeometries`. Reduces draw calls from ~15k to ~10.

### renderer/src/three/waterGeometry.js
- **Purpose:** [INFERRED] Parses natural=water polygons and renders them as flat or slightly animated transparent planes.

### renderer/src/three/zoneGeometry.js
- **Purpose:** [INFERRED] Renders semi-transparent flat polygons to represent landuse (commercial, residential, industrial) mapped to ground level.

### renderer/src/three/railGeometry.js
- **Purpose:** [INFERRED] Renders railway lines, likely similarly to roads but with specific material treatments (e.g., dashed lines).

### renderer/src/three/amenityGeometry.js
- **Purpose:** [INFERRED] Places 3D icons, point lights, or low-poly markers at POI coordinates (hospitals, schools, etc.).

### renderer/src/three/heatmapLayer.js
- **Purpose:** [INFERRED] Renders a spatial density overlay (e.g., traffic density, population) using a shader or textured plane.

### renderer/src/three/vehicleAgents.js & pedestrianAgents.js
- **Purpose:** [INFERRED] Simulates moving entities along road networks. Uses `THREE.InstancedMesh` where the matrix of each instance is updated in the `animate` loop based on pathfinding data.

### renderer/src/three/dayNightCycle.js
- **Purpose:** [INFERRED] Modifies directional light positions (sun/moon) and hemisphere light colors based on a simulated time of day.

### renderer/src/three/lodManager.js
- **Purpose:** [INFERRED] Hides or simplifies complex geometries based on camera distance to maintain high FPS.

### renderer/src/store/cityStore.js
- **Purpose:** Centralized state management using Zustand.
- **Exports:** `useCityStore`, and multiple fine-grained selectors (`useLayersSelector`, etc.).
- **Key algorithms:** Exposes actions that trigger async IPC calls. Maintains loading state and error handling.
- **How to modify safely:** Add new state variables at the top, and corresponding setter actions. Always use fine-grained selectors in React components to prevent unnecessary re-renders.

### python-sidecar/app/api/city.py
- **Purpose:** FastAPI router for city operations.
- **Exports:** `router`
- **Key algorithms:** Orchestrates the cache check -> Overpass query -> normalization -> projection pipeline. Uses `asyncio.to_thread` for CPU-bound tasks (JSON serialization, geometry processing) to prevent blocking the ASGI event loop.

### python-sidecar/app/services/schema_normalizer.py
- **Purpose:** Converts raw Overpass JSON into standardized GeoJSON.
- **Exports:** `normalize_overpass_response`
- **Key algorithms:** Stitches unclosed line segments into valid polygon rings (`_stitch_ways`). Determines categories via hierarchical tag checks (`_categorize`). Infers missing data (building height, road width) using established urban defaults.

### python-sidecar/app/services/overpass_client.py
- **Purpose:** Interacts with the external Overpass API.
- **Exports:** `query_overpass`, `build_overpass_query`
- **Key algorithms:** Implements robust retry logic handling HTTP 429 (Rate Limited) with intelligent backoff respecting the `Retry-After` header.

### python-sidecar/app/db/
- **Purpose:** [INFERRED] Contains SQLite initialization and CRUD operations for caching processed GeoJSON files, saving redundant Overpass API calls.

### python-sidecar/app/schemas/
- **Purpose:** Pydantic models for strict data validation at API boundaries. Enforces BBox format and data shape.

### python-sidecar/app/core/
- **Purpose:** Pydantic `BaseSettings` for env configuration and global logging setup.

## 5. DATA SCHEMAS

### OSM Raw → Normalized (Python)
```json
// Raw Overpass API (Input)
{
  "type": "way",
  "id": 12345,
  "nodes": [1, 2, 3, 1],
  "tags": { "building": "yes", "height": "12", "name": "Main Tower" }
}

// Normalized GeoJSON (Output)
{
  "type": "Feature",
  "geometry": {
    "type": "Polygon",
    "coordinates": [[[lon1, lat1], [lon2, lat2], [lon3, lat3], [lon1, lat1]]] // Projected to Cartesian locally
  },
  "properties": {
    "osm_id": 12345,
    "osm_type": "building",
    "name": "Main Tower",
    "building_levels": 3,  // Inferred default if missing
    "height": 12.0,
    "display_name": "Main Tower"
  }
}
```

### Python → Electron (HTTP response)
```json
{
  "type": "FeatureCollection",
  "features": [ /* Array of normalized GeoJSON Features */ ],
  "bbox": [-122.4, 37.7, -122.3, 37.8],
  "metadata": {
    "feature_count": 5000,
    "buildings": 4000,
    "roads": 800,
    // ...other counts
  }
}
```

### Electron → Renderer (IPC payload)
```json
// city:load response
{
  "error": false,
  "data": { /* Full FeatureCollection object as above */ }
}
```

### WebSocket Message Types
```json
// Ingestion Progress Message
{
  "stage": "processing", // "querying", "processing", "building_geometry", "caching", "complete"
  "percent": 45.5,
  "message": "Normalizing OpenStreetMap data..."
}
```

### SQLite Schema [INFERRED]
```sql
CREATE TABLE cached_cities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bbox TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    size_mb REAL NOT NULL,
    feature_count INTEGER NOT NULL,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    data TEXT NOT NULL -- Stored as JSON string
);
```

### Zustand Store Shape
```typescript
interface CityStore {
    cityData: FeatureCollection | null;
    cityName: string;
    isLoading: boolean;
    error: string | null;
    progress: { stage: string; percent: number; message: string; };
    showProgress: boolean;
    cachedCities: Array<{id: number, name: string, bbox: string}>;
    showCacheManager: boolean;
    showSearch: boolean;
    selectedEntity: any | null;
    layers: { buildings: boolean, roads: boolean, /* ... */ };
    isXRayMode: boolean;
    isPlaying: boolean;
    simSpeed: number;
    timeOfDay: { time: string, icon: string };
    agentCounts: { vehicles: number, pedestrians: number };
    // Actions...
}
```

## 6. ENVIRONMENT & CONFIGURATION

### `.env` File
- `PYTHON_PATH`: Path to the python executable (defaults to `python`). Breaks Python spawning if path is invalid.
- `SIDECAR_PORT`: Port for the FastAPI app. If set to `auto`, `portManager.js` finds a free port.
- `NODE_ENV`: Standard environment flag (`development` or `production`).

### Hardcoded Constants
- **`electron/sidecar/spawnPython.js`**: `MAX_RESTARTS = 5`, `STARTUP_TIMEOUT = 15000` (ms), `HEALTH_CHECK_INTERVAL = 5000` (ms).
- **`python-sidecar/app/services/overpass_client.py`**: `OVERPASS_TIMEOUT = 60` (s), `MAX_RETRIES = 3`.
- **`renderer/src/three/buildingGeometry.js`**: Height band colors for BatchedMesh.

## 7. PERFORMANCE CHARACTERISTICS

- **Draw Calls:** Highly optimized. Instead of 10,000+ draw calls, buildings use a single `THREE.BatchedMesh`. Roads are merged by type into ~10 `THREE.Mesh` objects.
- **Thread Blocking:** Heavy geometry processing is pushed to `buildingWorker.js` in the renderer, and `asyncio.to_thread` is used in Python to keep the event loops free.
- **Memory Usage [INFERRED]:** 
  - JS Heap: 300MB - 800MB (depending on city size, due to GeoJSON objects).
  - GPU Memory: 500MB - 1GB (Geometry buffers and shadow maps).
  - Python Process: ~100MB - 300MB.
- **Bottlenecks:** Overpass API download time (can take 10s-30s for large bounding boxes).
- **FPS:** Targets 60 FPS. Drops typically occur only during initial scene layout (synchronous stage 1 of rendering).

## 8. DEVELOPMENT WORKFLOWS

### Adding a new geometry layer
1. **Python (`schema_normalizer.py`):** Add tagging rules to `_categorize` to recognize the new OSM feature. Add it to `_normalize_properties`.
2. **Three.js (`renderer/src/three/newLayerGeometry.js`):** Create a factory function (e.g., `createNewLayerGroup`) that filters features and returns a `THREE.Group` of merged meshes.
3. **Scene (`CityScene.jsx`):** Call the factory function in the `buildCity` sequence and add it to the `cityGroup`. Update the visibility `useEffect`.
4. **Store (`cityStore.js`):** Add a boolean toggle to the `layers` object.
5. **UI (`LayerToggles.jsx`):** Add a UI switch bound to the store toggle.

### Adding a new Python endpoint
1. **Router (`python-sidecar/app/api/...`):** Define the `@router.get` endpoint.
2. **Security:** Always include `authorization: Optional[str] = Header(None)` and call `_verify_token`.
3. **Electron (`ipc/cityHandlers.js`):** Create a new `ipcMain.handle` block. Use `fetchWithRetry` to make the HTTP call.
4. **Preload (`preload.js`):** Expose the IPC channel in `electronAPI`.
5. **Renderer:** Call it from `cityStore.js` or directly via `window.electronAPI`.

## 9. KNOWN BUGS & EDGE CASES

- **Edge Case Handled (Geometry Validation):** Degenerate OSM polygons (zero-area, collinear points) cause `ExtrudeGeometry` to generate NaNs. Handled in `buildingGeometry.js` via `isGeometryValid` and falls back to `createFallbackBox`.
- **Edge Case Handled (Connection Refused):** If the Python sidecar crashes mid-session, Electron's `fetchWithRetry` catches the `ECONNREFUSED` error and triggers a silent background reboot of the sidecar before retrying the fetch.
- **Edge Case NOT Handled:** Requesting a bounding box with an extreme density of elements (>500k features) may exceed V8's memory limits when parsing the JSON response in Electron, crashing the renderer silently.

## 10. DEPENDENCY GRAPH

```text
[React UI Components]
         |
         v
  [Zustand Store] (cityStore.js) -----> [Three.js Scene] (CityScene.jsx, workers)
         |
         v
  [Preload API] (preload.js)
         |
         v
  [IPC Main] (cityHandlers.js, spawnPython.js)
         | HTTP (localhost:dynamic_port)
         v
  [FastAPI Sidecar] (main.py, city.py)
         |
    +----+----+
    |         |
    v         v
[SQLite]   [Overpass API]
```

## 11. GLOSSARY

- **Bbox:** Bounding Box. Defines a geographical area formatted as North, South, East, West latitudes/longitudes.
- **Sidecar:** The Python FastAPI background process that handles heavy data lifting, isolated from the Node/Electron environment.
- **BatchedMesh:** A Three.js optimization technique (similar to InstancedMesh) allowing thousands of objects with different geometries to be rendered in a single draw call.
- **LOD:** Level of Detail. Swapping high-poly meshes for low-poly representations when the camera is far away.
- **Overpass:** An API for querying OpenStreetMap data directly.
- **Normalizer:** The Python service that standardizes chaotic OSM tags into predictable properties.
- **Ribbon geometry:** Generating a thick 3D mesh strip following a 2D mathematical line (used for roads).

## 12. AI ASSISTANT QUICK REFERENCE

- "If asked to add a building feature → start in `schema_normalizer.py` to extract the OSM tag, then update `buildingGeometry.js` to visualize it, then add to Zustand store."
- "If asked to fix a rendering/FPS bug → check `CityScene.jsx` first, ensure meshes are being batched or merged (e.g., `BufferGeometryUtils.mergeGeometries`)."
- "Never modify `preload.js` without updating both `main.js` ipc handler and the renderer-side usage in the store/UI."
- "The Python sidecar port is dynamic — never hardcode `8765`. Always use `getSidecarPort()` in Electron or receive it via `window.electronAPI.getSidecarInfo()` in React."
- "Python logic mapping CPU-bound tasks (JSON serialization, geometry math) MUST be wrapped in `await asyncio.to_thread(...)` to avoid blocking the FastAPI event loop."
- "Three.js materials for static elements (roads, buildings) should prefer `MeshPhongMaterial` or `MeshLambertMaterial` over `MeshStandardMaterial` for performance, unless PBR properties are explicitly required."
- "Do not block the React main thread with geometry generation. Use the progressive `yieldFrame` pattern in `CityScene.jsx` or Web Workers."

## Last Updated
2026-04-29 — Integrated Phase 6 Terrain Elevation Rendering; updated IPC and API documentation.
