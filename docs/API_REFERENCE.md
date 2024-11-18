# API Reference — Python Sidecar

Base URL: `http://127.0.0.1:{port}` (port is dynamically assigned)  
Auth: `Authorization: Bearer {token}` (token generated per session)

---

## Health Check

### `GET /health`

Check if the sidecar is running and ready.

**Headers**: `Authorization: Bearer {token}` (required unless dev mode)

**Response** `200 OK`:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "port": 54321
}
```

**Error** `401`: Missing Authorization header  
**Error** `403`: Invalid token

---

## City Data

### `GET /city?bbox=N,S,E,W`

Load city data for a bounding box. Checks cache first, falls back to Overpass API.
All coordinates in the response are projected to **local Cartesian meters** (not WGS84).

**Query Parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `bbox` | string | Comma-separated bounding box: `north,south,east,west` |

**Area Limits**:
- Minimum: 0.01 km²
- Maximum: 25 km²

**Response** `200 OK`:
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[x, y, 0], [x, y, 0], ...]]
      },
      "properties": {
        "osm_id": 28768699,
        "osm_type": "building",
        "name": null,
        "height": 10.5,
        "building_levels": 3,
        "tags": { "building": "yes" }
      }
    }
  ],
  "bbox": [west, south, east, north],
  "metadata": {
    "feature_count": 4381,
    "buildings": 2374,
    "roads": 1436,
    "landuse": 267,
    "amenities": 304,
    "origin": { "lon": 72.8282, "lat": 18.9067 }
  }
}
```

**Error Responses**:

| Status | Condition | Detail |
|--------|-----------|--------|
| `400` | Invalid bbox format | `"Invalid bounding box: ..."` |
| `400` | Area too small (< 0.01 km²) | `"Area too small: ... km². Minimum is 0.01 km²."` |
| `400` | Area too large (> 25 km²) | `"Area too large: ... km². Maximum is 25 km²."` |
| `404` | No OSM data in area | `"No data found for this area..."` |
| `404` | No features after normalization | `"No recognizable features..."` |
| `502` | Overpass API failure | Error message from upstream |

---

## WebSocket Ingest (Streaming Progress)

### `WS /ws/ingest`

Real-time ingestion with progress updates.

**Client sends**:
```json
{ "bbox": "N,S,E,W" }
```

**Server streams** (multiple messages):
```json
{ "stage": "querying", "percent": 10, "message": "Querying Overpass API…" }
{ "stage": "processing", "percent": 40, "message": "Normalizing OpenStreetMap data…" }
{ "stage": "building_geometry", "percent": 60, "message": "Projecting coordinates…" }
{ "stage": "caching", "percent": 85, "message": "Saving to local database…" }
{ "stage": "complete", "percent": 100, "message": "City loaded successfully", "data": { ... } }
```

If data is cached, a single `complete` message is sent immediately with `"Loaded from cache"`.

---

## Cache Management

### `GET /city/cache`

List all cached cities.

**Response** `200 OK`:
```json
[
  {
    "id": 1,
    "name": "City @ 18.9200,72.8350",
    "bbox": "18.9,72.8,18.92,72.85",
    "feature_count": 4381,
    "size_mb": 2.34,
    "cached_at": 1740600000.0,
    "ttl_hours": 48
  }
]
```

### `DELETE /city/cache/{cache_id}`

Delete a specific cached city.

**Path Parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `cache_id` | int | Cache entry ID |

**Response** `200 OK`:
```json
{ "deleted": true }
```

**Error** `404`:
```json
{ "detail": "Cache entry not found" }
```
