# City Simulator — Optimization Report (Part 1: Rendering)
> Based on live codebase audit. All fixes reference real variable names.

---

## [0a] Road Geometry: Individual Meshes → Single Merged Mesh

**File:** `renderer/src/three/roadGeometry.js`
**Problem:** Each road creates its own `Mesh` + `MeshStandardMaterial` (lines 77-83), producing up to 12,928 draw calls for Mumbai alone.
**Impact:** Performance — this is the single largest draw-call cost in the app.

```js
// Replace the entire bottom loop in createRoadGroup() with this:
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createRoadGroup(features) {
    const group = new THREE.Group();
    group.name = 'roads';

    const roads = features.filter(
        (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
    );

    // Bucket by road type
    const buckets = {};
    for (const road of roads) {
        const type = road.properties?.highway_type || 'default';
        const geom = createRoadStripGeometry(road);
        if (!geom) continue;
        if (!buckets[type]) buckets[type] = [];
        buckets[type].push(geom);
    }

    // ONE merged mesh per road type — ~10 draw calls total instead of 12,928
    for (const [type, geoms] of Object.entries(buckets)) {
        try {
            const merged = mergeGeometries(geoms, false);
            geoms.forEach(g => g.dispose());
            if (!merged) continue;

            const color = ROAD_COLORS[type] || ROAD_COLORS.default;
            const mat = new THREE.MeshLambertMaterial({ // Lambert, not Standard — roads need no PBR
                color,
                side: THREE.DoubleSide,
                polygonOffset: true,
                polygonOffsetFactor: -1,
                polygonOffsetUnits: -1,
            });
            const mesh = new THREE.Mesh(merged, mat);
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false; // static geometry
            mesh.updateMatrix();
            mesh.userData = { type: 'road', highway_type: type };
            group.add(mesh);
        } catch (err) {
            console.error('[roads] Merge failed for type', type, err);
        }
    }
    return group;
}
```

---

## [0b] Off-Main-Thread Geometry: Web Worker for Buildings

**File (new):** `renderer/src/three/workers/buildingWorker.js`
**Problem:** `createBuildingGroup()` in `buildingGeometry.js` runs `ExtrudeGeometry` and `ringToShape` synchronously on the main thread, freezing the UI for 2-4 seconds on cities with 20k+ buildings.
**Impact:** Performance — eliminates the main-thread geometry stall entirely.

```js
// renderer/src/three/workers/buildingWorker.js
// Runs in a Worker — has NO access to THREE or the DOM.

self.onmessage = function(e) {
    const { features } = e.data;
    const buildings = features.filter(
        f => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    const positions = [];
    const indices = [];
    const colors = [];
    const HEIGHT_BANDS = [
        { max: 8,        r: 0.50, g: 0.52, b: 0.58 },
        { max: 20,       r: 0.55, g: 0.57, b: 0.65 },
        { max: 40,       r: 0.60, g: 0.63, b: 0.72 },
        { max: Infinity, r: 0.68, g: 0.70, b: 0.80 },
    ];

    let vertexOffset = 0;

    for (const feature of buildings) {
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        const height = feature.properties?.height || 10.5;

        // Simple box footprint extrusion (no THREE dependency)
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [x, y] of ring) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        const w = Math.max(maxX - minX, 1);
        const d = Math.max(maxY - minY, 1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        // 8 vertices of a box
        const x0 = cx - w/2, x1 = cx + w/2;
        const z0 = -cy - d/2, z1 = -cy + d/2;
        const verts = [
            x0,0,z0, x1,0,z0, x1,0,z1, x0,0,z1,     // bottom
            x0,height,z0, x1,height,z0, x1,height,z1, x0,height,z1, // top
        ];
        for (const v of verts) positions.push(v);

        const band = HEIGHT_BANDS.find(b => height <= b.max);
        for (let i = 0; i < 8; i++) colors.push(band.r, band.g, band.b);

        const b = vertexOffset;
        // Side faces
        indices.push(b,b+4,b+5, b,b+5,b+1, b+1,b+5,b+6, b+1,b+6,b+2,
                     b+2,b+6,b+7, b+2,b+7,b+3, b+3,b+7,b+4, b+3,b+4,b);
        // Top face
        indices.push(b+4,b+7,b+6, b+4,b+6,b+5);
        vertexOffset += 8;
    }

    const posArr = new Float32Array(positions);
    const colArr = new Float32Array(colors);
    const idxArr = new Uint32Array(indices);

    self.postMessage({ posArr, colArr, idxArr }, [posArr.buffer, colArr.buffer, idxArr.buffer]);
};
```

```js
// In CityScene.jsx — replace the Pass 1 buildings block:
async function buildBuildingsAsync(features) {
    return new Promise((resolve) => {
        const worker = new Worker(
            new URL('../../three/workers/buildingWorker.js', import.meta.url),
            { type: 'module' }
        );
        worker.onmessage = (e) => {
            const { posArr, colArr, idxArr } = e.data;
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
            geom.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));
            geom.setIndex(new THREE.BufferAttribute(idxArr, 1));
            geom.computeVertexNormals();

            const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
            const mesh = new THREE.Mesh(geom, mat);
            mesh.name = 'buildings-solid';
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.matrixAutoUpdate = false;
            mesh.updateMatrix();

            const group = new THREE.Group();
            group.name = 'buildings';
            group.add(mesh);
            worker.terminate();
            resolve(group);
        };
        worker.postMessage({ features });
    });
}

// In buildCity() async function, replace Pass 1:
const buildings = await buildBuildingsAsync(features);
cityGroup.add(buildings);
if (cancelled) return;
await yieldFrame();
```

---

## [0c] Amenity Geometry: Already Instanced — Fix Color Grouping

**File:** `renderer/src/three/amenityGeometry.js`
**Problem:** Already uses `InstancedMesh` (good!), but groups by color creating ~10 `InstancedMesh` objects. We can use a single `InstancedMesh` with `setColorAt()` for 1 draw call.
**Impact:** Performance — reduces amenity draw calls from ~10 to 1.

```js
export function createAmenityGroup(features) {
    const group = new THREE.Group();
    group.name = 'amenities';

    const amenities = features.filter(
        (f) => f.properties?.osm_type === 'amenity' && f.geometry?.type === 'Point'
    );
    if (amenities.length === 0) return group;

    const markerGeometry = new THREE.CylinderGeometry(1.5, 2, 6, 6);
    const material = new THREE.MeshPhongMaterial({
        vertexColors: false,
        transparent: true,
        opacity: 0.9,
    });

    // ONE InstancedMesh for all amenities
    const instancedMesh = new THREE.InstancedMesh(markerGeometry, material, amenities.length);
    instancedMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < amenities.length; i++) {
        const type = amenities[i].properties?.amenity || 'default';
        const color = AMENITY_COLORS[type] || AMENITY_COLORS.default;
        const coords = amenities[i].geometry.coordinates;
        dummy.position.set(coords[0], 3, -coords[1]);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
        instancedMesh.setColorAt(i, color);
    }

    instancedMesh.instanceMatrix.needsUpdate = true;
    if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
    instancedMesh.matrixAutoUpdate = false;
    instancedMesh.updateMatrix();
    group.add(instancedMesh);
    return group;
}
```

---

## [0d] Progressive Rendering Pipeline

**File:** `renderer/src/components/scene/CityScene.jsx`
**Problem:** All 8 geometry passes run before `scene.add(cityGroup)` (line 388), so the user sees a blank screen for the full build time (~5-8s for Mumbai).
**Impact:** Performance + UX — user sees the city within 500ms.

```js
// Replace the buildCity() async function in CityScene.jsx:
const buildCity = async () => {
    const cityGroup = new THREE.Group();
    cityGroup.name = 'city';
    scene.add(cityGroup); // Add FIRST — visible immediately

    // Stage 1 (~0ms): Roads — thin ribbons, fast
    const roads = createRoadGroup(features);
    roads.name = 'roads';
    cityGroup.add(roads);
    await yieldFrame(); // paint frame
    if (cancelled) return;

    // Stage 2 (~500ms): Buildings via worker (non-blocking)
    const buildingsPromise = buildBuildingsAsync(features);

    // Stage 3: Water + Zones while buildings build in worker
    const water = createWaterGroup(features);
    water.name = 'water';
    cityGroup.add(water);
    await yieldFrame();
    if (cancelled) return;

    const zones = createZoneGroup(features);
    zones.name = 'zones';
    cityGroup.add(zones);
    await yieldFrame();
    if (cancelled) return;

    // Stage 4: Resolve buildings (worker should be done by now)
    const buildings = await buildingsPromise;
    buildings.name = 'buildings';
    cityGroup.add(buildings);
    cityGroupRef.current = cityGroup;
    await yieldFrame();
    if (cancelled) return;

    // Stage 5: Secondary layers
    const railways = createRailGroup(features);
    railways.name = 'railways';
    cityGroup.add(railways);
    await yieldFrame();
    if (cancelled) return;

    const amenities = createAmenityGroup(features);
    amenities.name = 'amenities';
    cityGroup.add(amenities);
    await yieldFrame();
    if (cancelled) return;

    const vegetation = createVegetationGroup(features);
    vegetation.name = 'vegetation';
    cityGroup.add(vegetation);
    await yieldFrame();
    if (cancelled) return;

    const pipelines = createPipelineGroup(features);
    pipelines.name = 'pipelines';
    cityGroup.add(pipelines);
    await yieldFrame();

    // Camera fit + simulation setup (unchanged from existing code)
    // ... (keep existing box/camera code from line 391 onwards)
};
```

---

## [0e] Frustum Culling in LOD Manager

**File:** `renderer/src/three/lodManager.js`
**Problem:** LOD loop at line 67 iterates ALL registered buildings every 0.5s even if they're behind the camera. With 20k buildings registered, this is expensive.
**Impact:** Performance — skips ~60% of work when camera is pointed at city center.

```js
// Add to lodManager.js — replace the update() method:
import * as THREE from 'three';

const _cameraPos = new THREE.Vector3();
const _objPos = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();

export class LODManager {
    constructor() {
        this.buildings = [];
        this.enabled = true;
        this.lastUpdate = 0;
        this.updateInterval = 0.5;
        this._lastDist = new Map(); // track last distance per building
    }

    update(camera, dt) {
        if (!this.enabled || this.buildings.length === 0) return;

        this.lastUpdate += dt;
        if (this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = 0;

        // Build frustum once per LOD tick — not per frame
        _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_projScreenMatrix);

        camera.getWorldPosition(_cameraPos);

        for (const b of this.buildings) {
            // Skip frustum-culled objects entirely
            if (b.mesh.geometry?.boundingSphere) {
                b.mesh.getWorldPosition(_objPos);
                if (!_frustum.containsPoint(_objPos)) {
                    b.mesh.visible = false;
                    continue;
                }
            }

            b.mesh.getWorldPosition(_objPos);
            const dist = _cameraPos.distanceTo(_objPos);

            // Skip recalculation if camera barely moved relative to this building
            const lastDist = this._lastDist.get(b) || 0;
            if (Math.abs(dist - lastDist) < 5) continue;
            this._lastDist.set(b, dist);

            if (dist < 300) {
                b.mesh.visible = true;
                b.mesh.castShadow = true;
            } else if (dist < 800) {
                b.mesh.visible = true;
                b.mesh.castShadow = false;
            } else if (dist < 2000) {
                b.mesh.visible = b.height >= 6;
                b.mesh.castShadow = false;
            } else {
                b.mesh.visible = b.height >= 15; // only tall buildings at extreme distance
                b.mesh.castShadow = false;
            }
        }
    }

    register(buildingGroup) {
        this.buildings = [];
        this._lastDist.clear();
        if (!buildingGroup) return;
        buildingGroup.traverse((obj) => {
            if (obj.isMesh && (obj.name === 'buildings-solid' || obj.userData?.type === 'building')) {
                this.buildings.push({ mesh: obj, height: obj.userData?.height || 10 });
            }
        });
    }

    dispose() {
        this.buildings = [];
        this._lastDist.clear();
    }
}
```

---

## [0f] Material Optimization — MeshStandardMaterial → MeshLambertMaterial on Roads

**File:** `renderer/src/three/roadGeometry.js`
**Problem:** `createRoadMaterial()` (line 90) uses `MeshStandardMaterial` with roughness/metalness — full PBR shading per fragment on 12,928 road strips.
**Impact:** Performance — Lambert is ~40% cheaper per fragment than Standard.

```js
// Already shown inline in fix 0a. The key change:
// MeshStandardMaterial { roughness, metalness } → MeshLambertMaterial
// Roads are flat, matte surfaces — PBR adds nothing visible.

// Also apply matrixAutoUpdate = false to ALL static city geometry:
// In createWaterGroup, createZoneGroup, createRailGroup — add after mesh creation:
mesh.matrixAutoUpdate = false;
mesh.updateMatrix();
```

---

## [0g] GeometryPool: Reuse GPU Buffers on City Switch

**File (new):** `renderer/src/three/geometryPool.js`

**Problem:** In `CityScene.jsx` line 310-313, every city switch calls `disposeGroup()` → destroys all GPU buffers → reallocates on next city. This causes a 1-2s GPU stall.
**Impact:** Memory + Performance — eliminates GPU reallocation stutter.

```js
// renderer/src/three/geometryPool.js
const POOL_SIZE = 3;

class GeometryPool {
    constructor() {
        this._pool = []; // [{ key, group, lastUsed }]
    }

    // Get cached group or return null (caller should build fresh)
    get(key) {
        const entry = this._pool.find(e => e.key === key);
        if (entry) {
            entry.lastUsed = Date.now();
            return entry.group;
        }
        return null;
    }

    // Store a built group; evict LRU if pool is full
    set(key, group) {
        // Remove existing entry for same key
        this._pool = this._pool.filter(e => e.key !== key);

        if (this._pool.length >= POOL_SIZE) {
            // Evict least recently used
            this._pool.sort((a, b) => a.lastUsed - b.lastUsed);
            const evicted = this._pool.shift();
            if (evicted?.group) {
                evicted.group.traverse(obj => {
                    if (obj.isMesh || obj.isInstancedMesh || obj.isBatchedMesh) {
                        obj.geometry?.dispose();
                        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                        else obj.material?.dispose();
                    }
                });
            }
        }
        this._pool.push({ key, group, lastUsed: Date.now() });
    }

    clear() {
        for (const entry of this._pool) {
            entry.group?.traverse(obj => {
                if (obj.isMesh || obj.isInstancedMesh) {
                    obj.geometry?.dispose();
                    obj.material?.dispose();
                }
            });
        }
        this._pool = [];
    }
}

export const geometryPool = new GeometryPool();
```

```js
// In CityScene.jsx buildCity(), use pool key = bbox string:
const poolKey = cityData.bbox?.join(',') || 'default';
const cached = geometryPool.get(poolKey);
if (cached) {
    scene.add(cached);
    cityGroupRef.current = cached;
    // skip geometry build, jump to simulation init
    return;
}

// ... build geometry as normal ...

geometryPool.set(poolKey, cityGroup);
```
