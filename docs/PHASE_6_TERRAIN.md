# Phase 6 — Terrain Elevation Rendering

**Status**: 🔧 In Progress (rendering fixes pending)  
**Date**: February 2026

## Objective

Render real-world terrain elevation data beneath the 3D city as a retro-futuristic
glowing cyan wireframe mesh, giving the cityscape visible topographic context.

---

## What Was Built

### 1. Elevation Client (`python-sidecar/app/services/elevation_client.py`)

Fetches terrain height data from the **Open-Meteo Elevation API** (free, no API key).

| Detail | Value |
|--------|-------|
| **API** | `https://api.open-meteo.com/v1/elevation` |
| **Grid** | N×N regular lat/lon sample grid across the bounding box |
| **Default resolution** | 48×48 = 2 304 sample points |
| **Batching** | 100 points per HTTP request (keeps URLs < 8 KB) |
| **Rate limiting** | 50 ms pause between batches |
| **Null handling** | `None` / `NaN` elevation values replaced with `0.0` |

**Returns:**
```json
{
  "grid": [[...], ...],       // 2-D array [row][col], row 0 = south
  "resolution": 48,
  "bounds": { "north": ..., "south": ..., "east": ..., "west": ... },
  "min_elevation": 12.0,
  "max_elevation": 87.0
}
```

### 2. Terrain API Endpoint (`python-sidecar/app/api/terrain.py`)

| Method | Path | Params |
|--------|------|--------|
| `GET` | `/terrain` | `bbox` (N,S,E,W), `resolution` (8–128, default 48) |

- Uses the same `BBox` schema and Bearer-token auth pattern as `/city`
- Registered in `main.py` alongside city and health routers

### 3. IPC Wiring

| Layer | File | Addition |
|-------|------|----------|
| **Main process handler** | `electron/ipc/cityHandlers.js` | `terrain:load` IPC handler with `fetchWithRetry`, 120 s timeout |
| **Preload bridge** | `electron/preload.js` | `loadTerrain(bbox, resolution)` exposed via `contextBridge` |
| **Renderer bridge** | `renderer/src/bridge/ipc.js` | `loadTerrain()` wrapper |

### 4. State Management (`renderer/src/store/cityStore.js`)

| State / Action | Purpose |
|----------------|---------|
| `terrainData` | Stores the elevation grid response (`null` until loaded) |
| `layers.terrain` | Toggle visibility (default `true`) |
| `setTerrainData(data)` | Setter |
| `loadTerrain(bbox)` | Async action — calls IPC → sidecar, sets `terrainData` on success |
| `clearCity()` | Resets `terrainData` to `null` on city change |

`loadCity()` automatically kicks off `loadTerrain(bbox)` in the background after
city data arrives.

### 5. Terrain Geometry Builder (`renderer/src/three/terrainGeometry.js`)

Builds a Three.js wireframe terrain mesh from the elevation grid.

**Visual Style:**
- Dark solid under-mesh with vertex colours (blue → teal → cyan gradient)
- Cyan wireframe overlay (the signature glowing grid)
- Optional glow wireframe layer for elevation ranges > 2 m

**Projection:**
- Converts the WGS-84 bbox to local Mercator metres using the same
  origin (bbox centre) as the building/road projection
- Width: `(east − west) × (π/180) × R × cos(lat)`
- Depth: `(north − south) × (π/180) × R`

**Vertex Y Mapping:**
```
y = (rawElevation − maxElevation) × exaggeration
```
- Peaks are at `y = 0` (same as building ground plane)
- Valleys extend downward into negative Y

**Adaptive Vertical Exaggeration:**

| Elevation Range (Δ) | Exaggeration |
|---------------------|-------------|
| < 5 m | 8.0× |
| < 20 m | 4.0× |
| < 50 m | 2.5× |
| < 150 m | 1.5× |
| ≥ 150 m | 1.0× |

**Mesh Stack (3 layers):**

| Layer | Material | Purpose |
|-------|----------|---------|
| Solid under-surface | `MeshPhongMaterial`, vertex colours, opacity 0.45 | Depth/shadow base |
| Wireframe | `MeshBasicMaterial`, cyan, opacity 0.55 | Main visible grid |
| Glow wireframe | `MeshBasicMaterial`, bright cyan, opacity 0.15 | Atmospheric glow |

All three use `depthWrite: false` and `transparent: true`.

### 6. Scene Integration (`renderer/src/components/scene/CityScene.jsx`)

- Terrain effect runs when `terrainData` + `sceneReady` + `cityData` are all present
- Reads `cityData.bbox` (set by the Python API as `[west, south, east, north]`)
- Disposes previous terrain group on re-render
- Layer toggle controls visibility via `terrainRef.current.visible`

### 7. UI — Layer Toggle

- New **terrain toggle button** added to `LayerToggles.jsx`
- Mountain-peaks SVG icon (`TerrainIcon`) in `Icons.jsx`
- Positioned between amenities and heatmap toggles
- Default state: **on**

---

## Data Flow

```
User loads city (search / cache)
        │
        ▼
  loadCity(bbox)  ──→  /city?bbox=N,S,E,W  ──→  GeoJSON + bbox
        │
        └──→  loadTerrain(bbox)
                    │
                    ▼
              terrain:load IPC  ──→  /terrain?bbox=N,S,E,W&resolution=48
                    │
                    ▼
              elevation_client.py  ──→  Open-Meteo API (batched)
                    │
                    ▼
              terrainData arrives in Zustand store
                    │
                    ▼
              CityScene terrain effect fires
                    │
                    ▼
              createTerrainGroup(terrainData, cityData.bbox)
                    │
                    ▼
              Wireframe terrain mesh added to scene
```

---

## Tests

| Suite | Count | Status |
|-------|-------|--------|
| Renderer (Vitest) | 42 tests including LayerToggles terrain button | ✅ Passing |
| Sidecar (pytest) | 8 tests | ✅ Passing |

---

## Known Issues

See [TERRAIN_BUGS.md](./TERRAIN_BUGS.md) for the active bug report.

---

## File Manifest

| File | Role |
|------|------|
| `python-sidecar/app/services/elevation_client.py` | Open-Meteo API client |
| `python-sidecar/app/api/terrain.py` | FastAPI `/terrain` endpoint |
| `python-sidecar/app/main.py` | Router registration |
| `electron/ipc/cityHandlers.js` | `terrain:load` IPC handler |
| `electron/preload.js` | `loadTerrain` bridge |
| `renderer/src/bridge/ipc.js` | IPC wrapper |
| `renderer/src/store/cityStore.js` | Terrain state + actions |
| `renderer/src/three/terrainGeometry.js` | Mesh builder |
| `renderer/src/components/scene/CityScene.jsx` | Terrain rendering effect |
| `renderer/src/components/ui/Icons.jsx` | `TerrainIcon` |
| `renderer/src/components/ui/LayerToggles.jsx` | Terrain toggle button |
