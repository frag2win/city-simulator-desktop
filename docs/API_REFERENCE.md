# API Reference — Python Sidecar

Base URL: `http://127.0.0.1:{port}` (port is dynamically assigned)  
Auth: `Authorization: Bearer {token}` (token generated per session)

---

## Health Check

### `GET /health`

Check if the sidecar is running and ready.

**Response** `200 OK`:
```json
{
  "status": "ok",
  "service": "city-simulator-sidecar",
  "version": "1.0.0"
}
```

---

## City Data

### `GET /city?south=...&west=...&north=...&east=...`

Load city data for a bounding box. Checks cache first, falls back to Overpass API.

**Query Parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `south` | float | Southern latitude boundary |
| `west` | float | Western longitude boundary |
| `north` | float | Northern latitude boundary |
| `east` | float | Eastern longitude boundary |

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

**Coordinate System**: All coordinates in the response are projected to **local Cartesian meters** (not WGS84). Origin is stored in `metadata.origin`.

**Error** `400`:
```json
{ "detail": "Bounding box area exceeds 25 km² limit" }
```

---

## Cache Management

### `GET /city/cache`

List all cached cities.

**Response** `200 OK`:
```json
[
  {
    "id": 1,
    "name": "Colaba, Mumbai",
    "bbox": "18.9,72.8,18.92,72.85",
    "feature_count": 4381,
    "size_mb": 2.34,
    "cached_at": 1740600000.0,
    "ttl_hours": 48
  }
]
```

### `DELETE /city/cache/{id}`

Delete a specific cached city.

**Path Parameters**:

| Param | Type | Description |
|-------|------|-------------|
| `id` | int | Cache entry ID |

**Response** `200 OK`:
```json
{ "deleted": true }
```

**Response** `404`:
```json
{ "detail": "Cache entry not found" }
```
