# Phase 2 — Data Ingestion & Local Database

**Status**: ✅ Complete  
**Date**: February 2026

## Objective

Build the complete data pipeline: user searches a city → Overpass API query → normalize to GeoJSON → project to Cartesian coordinates → cache in SQLite → deliver to renderer.

## What Was Built

### Overpass API Client (`services/overpass_client.py`)

Fetches raw OpenStreetMap data for a given bounding box.

- **Endpoint**: `https://overpass-api.de/api/interpreter`
- **Query**: Fetches buildings, highways, amenities, landuse, water within bbox
- **Features**:
  - Async HTTP via `httpx.AsyncClient`
  - 25 km² area limit (prevents server overload)
  - Automatic retries with exponential backoff
  - Structured error messages for timeout/rate-limit
  - Returns raw Overpass JSON `{ elements: [...] }`

### Schema Normalizer (`services/schema_normalizer.py`)

Converts raw Overpass JSON → standardized GeoJSON FeatureCollection.

**Process**:
1. Build node lookup table (`id → [lon, lat]`)
2. Convert ways to polygons (buildings, landuse) or linestrings (roads)
3. Convert tagged nodes to points (amenities, POIs)
4. Normalize properties with intelligent defaults
5. Deduplicate by OSM ID

**Property Normalization**:

| Category | Normalized Properties |
|----------|----------------------|
| Building | `height` (from tags or `levels × 3.5m`), `building_levels` (default: 3) |
| Highway | `highway_type`, `lanes`, `surface`, `road_width` (from lookup table) |
| Amenity | `amenity` type string |
| Landuse | `landuse` type string |

**Road Width Table**:
```
motorway: 14m, trunk: 12m, primary: 10m, secondary: 8m
tertiary: 7m, residential: 6m, service: 4m, footway: 2m
```

### Spatial Processor (`services/spatial_processor.py`)

Projects WGS84 (lat/lon) coordinates to local Cartesian (meters from origin).

**Algorithm**: Web Mercator approximation
```python
x = (lon - origin_lon) × (π/180) × R × cos(origin_lat)
y = (lat - origin_lat) × (π/180) × R
# R = 6,378,137 m (WGS84 Earth radius)
```

**Input**: GeoJSON with `[lon, lat]` coordinates  
**Output**: GeoJSON with `[x_meters, y_meters, 0]` coordinates  
**Origin**: Center of the bounding box (stored in `metadata.origin`)

Handles all geometry types:
- `Point` → `[x, y, 0]`
- `LineString` → `[[x, y, 0], ...]`
- `Polygon` → `[[[x, y, 0], ...], ...]`

### SQLite Cache (`db/database.py`)

Persistent local cache using async SQLite.

**Schema**:
```sql
CREATE TABLE city_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    bbox TEXT NOT NULL UNIQUE,
    geojson TEXT NOT NULL,          -- Full projected GeoJSON (JSON string)
    feature_count INTEGER DEFAULT 0,
    size_bytes INTEGER DEFAULT 0,
    cached_at REAL NOT NULL,        -- Unix timestamp
    ttl_hours REAL DEFAULT 48
)
```

**Operations**:
- `get_cached_city(bbox)` — lookup by bbox string, checks TTL
- `cache_city(bbox, name, geojson)` — upsert (delete + insert)
- `list_cached_cities()` — metadata for cache manager UI
- `delete_cached_city(id)` — remove single entry
- `clear_all_cache()` — wipe all entries

**Cache Path**: `~/.city-simulator/city_cache.db`

### City API Endpoints (`api/city.py`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/city` | GET | Load city by bbox. Checks cache, falls back to Overpass |
| `/city/cache` | GET | List all cached cities |
| `/city/cache/{id}` | DELETE | Delete a cached city |

### UI Components

#### CitySearchBar (`components/ui/CitySearchBar.jsx`)
- Triggered by **Ctrl+L** global shortcut
- Two modes: city name (geocoding) or raw bbox coordinates
- **Geocoding**: Uses Nominatim API (`https://nominatim.openstreetmap.org/search`)
- **Auto-crop**: If geocoded bbox exceeds ~20 km², automatically crops to ~2km × 2km centered on the result point
- Shows search results in dropdown, click to load

#### ProgressModal (`components/ui/ProgressModal.jsx`)
- Displays during city loading
- Shows stage (querying, processing, caching) and progress percentage
- Glassmorphism-styled overlay

#### CacheManager (`components/ui/CacheManager.jsx`)
- Lists all cached cities with metadata (name, feature count, size, age)
- Delete individual cache entries
- Shows total cache size
- Accessed via cache manager button in HUD

## Bugs Fixed During Phase 2

### 1. `ModuleNotFoundError: No module named 'uvicorn'`
**Root cause**: Electron spawned Python using system Python, not the venv.  
**Fix**: Modified `spawnPython.js` to prioritize `.venv/Scripts/python.exe`.

### 2. "fetch failed" on city load
**Root cause**: Python sidecar failing to start (missing deps).  
**Fix**: Created `.venv`, installed requirements, added 90s timeout to IPC handler.

### 3. "Area too large" for city searches
**Root cause**: Nominatim returns administrative bbox for city names (e.g., all of Mumbai = 600 km²).  
**Fix**: Auto-crop to ~2km × 2km area centered on geocoded point.

### 4. CORS error on cache operations
**Root cause**: `cityStore.js` fetched sidecar directly from renderer (bypassing IPC).  
**Fix**: Added `listCachedCities` and `deleteCachedCity` IPC channels through preload/main.

## Dependencies Added

**Python**: `httpx`, `aiosqlite`  
**Node.js (renderer)**: `zustand`
