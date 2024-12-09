# Phase 3 — 3D Rendering Engine

**Status**: 🔧 In Progress (core rendering complete)  
**Date**: February 2026

## Objective

Build a real-time 3D viewport using Three.js that renders the GeoJSON city data as an interactive 3D cityscape with buildings, roads, and amenity markers.

## What Was Built

### CityScene Component (`components/scene/CityScene.jsx`)

The main Three.js viewport, implemented as a React component.

**Scene Setup**:
- `WebGLRenderer` with antialiasing, ACES filmic tone mapping (exposure 1.3)
- `PerspectiveCamera` (FOV 50°, near 0.5, far 100,000)
- `FogExp2` (density 0.00004) for depth fade
- Background: `0x080810` (near-black blue)

**Lighting** (5-light cinematic setup):

| Light | Type | Color | Intensity | Purpose |
|-------|------|-------|-----------|---------|
| Ambient | AmbientLight | `0xccccff` | 0.7 | Base illumination |
| Hemisphere | HemisphereLight | sky `0x7799cc` / ground `0x222233` | 0.5 | Sky/ground color bleed |
| Sun | DirectionalLight | `0xffeedd` | 1.2 | Main warm light + shadow maps |
| Fill | DirectionalLight | `0x6688aa` | 0.4 | Cool opposite-side fill |
| Rim | DirectionalLight | `0x4455aa` | 0.2 | Subtle backlight edge |

**Shadow Configuration**:
- Shadow map: 2048×2048 PCFShadowMap
- Shadow camera covers ±3000 units
- Bias: -0.0005

**Camera Controls** (`OrbitControls`):
- Damping enabled (factor 0.08)
- Max polar angle: `π/2.1` (can't go underground)
- Zoom range: 10 to 20,000 units
- Auto-fit: Camera auto-positions to view entire city on load

**Ground & Grid**:
- 20,000×20,000 unit ground plane (`MeshPhongMaterial`, dark `0x0c0c16`)
- 8,000 unit grid helper (160 divisions)

### Building Geometry (`three/buildingGeometry.js`)

Renders OSM buildings as 3D boxes positioned at polygon centroids.

**Algorithm**:
1. Filter features where `osm_type === 'building'` and `geometry.type === 'Polygon'`
2. For each building polygon:
   - Compute bounding box of the polygon ring
   - Extract width (X span) and depth (Y span)
   - Get height from properties (or default 10.5m = 3 floors × 3.5m)
   - Create `BoxGeometry(width, height, depth)`
   - Position at `(centroid_x, height/2, -centroid_y)`
3. Add `EdgesGeometry` wireframe overlay for visual clarity

**Coordinate Mapping** (projection → Three.js):
```
Projected:  [x_meters, y_meters, 0]
Three.js:   position(x, height/2, -y)
           X = east-west
           Y = up (vertical)
           Z = -(north-south)
```

**Color Palette** (HSL height-based):

| Height | HSL | Appearance |
|--------|-----|------------|
| ≤ 8m | (0.60, 0.15, 0.55) | Dark slate |
| ≤ 20m | (0.58, 0.18, 0.62) | Steel |
| ≤ 40m | (0.56, 0.22, 0.68) | Light steel |
| > 40m | (0.54, 0.25, 0.75) | Bright steel |

**Material**: `MeshPhongMaterial` with flat shading, shininess 30, DoubleSide rendering.

### Road Geometry (`three/roadGeometry.js`)

Renders OSM roads as flat ribbon meshes using manual BufferGeometry triangle strips.

**Algorithm**:
1. Filter features where `osm_type === 'highway'` and `geometry.type === 'LineString'`
2. For each road:
   - Walk along the coordinate array
   - At each point, compute perpendicular direction
   - Create left/right edge vertices offset by half-width
   - Build triangle indices connecting consecutive vertex pairs
3. Position road surface at Y=0.5 (above ground plane at Y=0)

**Road Colors by Type**:

| Type | Color | Width |
|------|-------|-------|
| Motorway | `0xe88d5a` (orange) | 7.0m |
| Trunk | `0xd4885a` | 6.0m |
| Primary | `0xc9a652` (gold) | 5.0m |
| Secondary | `0x8b9fad` | 4.0m |
| Residential | `0x5c6b77` (gray) | 3.0m |
| Footway | `0x6b8070` (green) | 1.0m |

**Z-Fighting Fix**: Roads use `polygonOffset: true` with factor/units of -1 to prevent depth buffer conflicts with the ground plane.

### Amenity Geometry (`three/amenityGeometry.js`)

Renders OSM point amenities as instanced 3D cylinder markers.

**Algorithm**:
1. Filter features where `osm_type === 'amenity'` and `geometry.type === 'Point'`
2. Group amenities by color (based on amenity type)
3. For each color group, create a single `InstancedMesh` (6-sided cylinder, radius 1.5-2, height 6)
4. Set position for each instance to `(x, 3, -y)` (3 = half-height of cylinder)

**Amenity Colors**:

| Type | Color |
|------|-------|
| Hospital | Red `0xef4444` |
| School/University | Amber `0xf59e0b` |
| Restaurant | Green `0x22c55e` |
| Cafe | Purple `0x8b5cf6` |
| Bank | Blue `0x3b82f6` |
| Pharmacy | Emerald `0x10b981` |
| Default | Indigo `0x818cf8` |

**Performance**: Uses `InstancedMesh` for GPU instancing — all markers of the same color share one draw call.

## Debugging Journey

The 3D rendering required significant debugging to get working:

### Issue 1: Buildings Invisible (ExtrudeGeometry)
- **Symptom**: 2374 building meshes created, bounding box computed correctly, but nothing visible
- **Root cause**: `THREE.ExtrudeGeometry` produces degenerate triangles from complex OSM polygons (self-intersections, clockwise winding)
- **Fix**: Switched to `BoxGeometry` at polygon centroid — simpler, guaranteed to render

### Issue 2: Buildings Invisible (DoubleSide)
- **Symptom**: BoxGeometry also invisible
- **Root cause**: Default `FrontSide` rendering + face normals pointing inward
- **Fix**: Added `side: THREE.DoubleSide` to building material

### Issue 3: Road Z-Fighting
- **Symptom**: Roads flicker/shimmer when camera moves
- **Root cause**: Road surface at Y=0.2 too close to ground at Y=0 in depth buffer
- **Fix**: Raised roads to Y=0.5 + `polygonOffset: true` on material

### Issue 4: Camera Not Pointing at City
- **Symptom**: Camera at (0, 800, 800) looking at origin, but city at (-181, 75, -514)
- **Root cause**: `fitCameraToCity` not working because bounding box was empty/NaN
- **Fix**: Safety checks in `fitCameraToCity`, guaranteed valid bounds from BoxGeometry

## Dependencies Added

**Node.js (renderer)**: `three` (Three.js r170+)

## Remaining Work

- [ ] **Entity selection** — raycasting on click, info panel for selected building/road
- [ ] **Layer toggles** — show/hide buildings, roads, amenities independently
- [ ] **Camera presets** — top-down, perspective, street-level views
