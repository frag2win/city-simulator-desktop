/**
 * terrainGeometry.js — Builds a wireframe terrain mesh from an elevation grid.
 *
 * Visual style inspired by retro-futuristic topography:
 *   • Glowing cyan wireframe grid over a dark solid under-mesh
 *   • Vertex colours shift from deep blue (valleys) → bright cyan (peaks)
 *   • Terrain sits BELOW the city (y ≤ −5) — the highest terrain point
 *     is at y = TERRAIN_Y_OFFSET and relief extends downward, capped at
 *     MAX_VERT (80) scene units.  Renders AFTER opaque city geometry
 *     (renderOrder 1) so depth testing hides it behind buildings
 *   • Vertical exaggeration adapts to the actual elevation range so flat
 *     cities still show visible topology
 */
import * as THREE from 'three';

// ── Colour helpers ──────────────────────────────────────────────────
/** Lerp between two THREE.Color instances and return a new one. */
const lerpColor = (a, b, t) => new THREE.Color().lerpColors(a, b, t);

const COL_LOW  = new THREE.Color(0x041830);   // deep dark blue (valleys)
const COL_MID  = new THREE.Color(0x0a6e6e);   // teal
const COL_HIGH = new THREE.Color(0x00ffcc);   // bright cyan-green (peaks)

const WIRE_COLOR  = 0x00e5ff;   // main wireframe tint
const SOLID_COLOR = 0x030a14;   // dark under-surface

// ── Constants ───────────────────────────────────────────────────────
const EARTH_R = 6378137;        // Earth radius for Mercator projection
const MAX_VERT = 80;            // max scene-units of vertical relief
const TERRAIN_Y_OFFSET = -5;    // push terrain below building ground plane

/**
 * Build a terrain group from the elevation API response and the city
 * bounding box.
 *
 * @param {object} terrainData   – { grid, resolution, min_elevation, max_elevation }
 * @param {number[]} cityBbox    – [west, south, east, north]  (WGS-84)
 * @returns {THREE.Group}        – ready to add to the scene
 */
export function createTerrainGroup(terrainData, cityBbox) {
    const { grid, resolution, min_elevation: minElev, max_elevation: maxElev } = terrainData;
    const [west, south, east, north] = cityBbox;

    const originLon = (west + east) / 2;
    const originLat = (south + north) / 2;
    const cosLat = Math.cos(originLat * Math.PI / 180);

    // Full extent of the bbox in local metres (same projection as buildings/roads)
    const totalWidth = (east - west)   * (Math.PI / 180) * EARTH_R * cosLat;
    const totalDepth = (north - south) * (Math.PI / 180) * EARTH_R;
    const halfW = totalWidth / 2;
    const halfD = totalDepth / 2;

    const elevRange = maxElev - minElev;

    // Adaptive vertical exaggeration → flat cities (< 20 m Δ) get amplified,
    // but capped so the total vertical relief never exceeds MAX_VERT units.
    const rawExag =
        elevRange < 5   ? 8.0 :
        elevRange < 20  ? 4.0 :
        elevRange < 50  ? 2.5 :
        elevRange < 150 ? 1.5 : 1.0;
    const exaggeration = elevRange > 0
        ? Math.min(rawExag, MAX_VERT / elevRange)
        : rawExag;

    // Actual vertical extent in scene units.
    const peakHeight = elevRange * exaggeration;

    // ── Build BufferGeometry manually for full control ────────────
    const verts   = [];   // x, y, z  (float32 ×3)
    const colors  = [];   // r, g, b  (float32 ×3)
    const indices = [];

    for (let row = 0; row < resolution; row++) {
        const latFrac = row / (resolution - 1);       // 0 = south, 1 = north
        const z = halfD - latFrac * totalDepth;        // south = +Z, north = −Z

        for (let col = 0; col < resolution; col++) {
            const lonFrac = col / (resolution - 1);    // 0 = west, 1 = east
            const x = -halfW + lonFrac * totalWidth;

            const rawElev = grid[row]?.[col] ?? 0;
            // y is relative to maxElev: peaks → 0, valleys → negative.
            // This keeps the terrain surface just below the building ground plane.
            const y = (rawElev - maxElev) * exaggeration;

            verts.push(x, y, z);

            // Colour gradient: low → mid → high
            const t = elevRange > 0 ? (rawElev - minElev) / elevRange : 0;
            const c = t < 0.5
                ? lerpColor(COL_LOW, COL_MID, t * 2)
                : lerpColor(COL_MID, COL_HIGH, (t - 0.5) * 2);
            colors.push(c.r, c.g, c.b);
        }
    }

    // Triangle indices
    for (let row = 0; row < resolution - 1; row++) {
        for (let col = 0; col < resolution - 1; col++) {
            const a = row * resolution + col;
            const b = a + 1;
            const c = a + resolution;
            const d = c + 1;
            indices.push(a, c, b);
            indices.push(b, c, d);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    // ── Meshes ───────────────────────────────────────────────────
    const group = new THREE.Group();
    group.name = 'terrain';

    // 1. Solid under-surface for depth / shadow
    const solidMat = new THREE.MeshPhongMaterial({
        color: SOLID_COLOR,
        vertexColors: true,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,       // don't occlude buildings/roads
        shininess: 10,
    });
    const solidMesh = new THREE.Mesh(geometry, solidMat);
    solidMesh.renderOrder = 1;   // draw after opaque city geometry (uses depth to hide behind buildings)
    group.add(solidMesh);

    // 2. Wireframe overlay (the signature glowing grid)
    const wireMat = new THREE.MeshBasicMaterial({
        color: WIRE_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
    });
    const wireMesh = new THREE.Mesh(geometry.clone(), wireMat);
    wireMesh.renderOrder = 1;
    group.add(wireMesh);

    // 3. Edge glow — slightly thicker bright lines at the very top
    if (elevRange > 2) {
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x00ffd5,
            wireframe: true,
            transparent: true,
            opacity: 0.15,
            depthWrite: false,
        });
        const glowMesh = new THREE.Mesh(geometry.clone(), glowMat);
        glowMesh.scale.set(1, 1.005, 1);   // slight offset to avoid z-fight
        glowMesh.renderOrder = 1;
        group.add(glowMesh);
    }

    // ── Position: peaks are at y=0 from the vertex formula; we push the
    // whole group slightly below the building ground plane so depth tests
    // keep buildings in front of the wireframe.
    group.position.y = TERRAIN_Y_OFFSET;

    console.log(
        `[Terrain] ${resolution}×${resolution} grid, ` +
        `elev ${minElev.toFixed(0)}–${maxElev.toFixed(0)} m ` +
        `(×${exaggeration} exaggeration, range ${peakHeight.toFixed(0)} units), ` +
        `extent ${totalWidth.toFixed(0)}×${totalDepth.toFixed(0)} m, ` +
        `positioned at y=${group.position.y.toFixed(1)}`
    );

    return group;
}
