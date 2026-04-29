/**
 * terrainGeometry.js — Solid terrain mesh from elevation grid.
 *
 * Following ArcGIS terrain rendering approach:
 *   • Terrain is a solid ground surface (not a wireframe overlay)
 *   • Elevation displaces the mesh surface downward from y=0
 *   • Buildings sit ON TOP of the terrain at y=0
 *   • Colour gradient shows elevation: dark valleys → lighter ridges
 *   • renderOrder=-1 so terrain always draws behind city geometry
 *
 * The mesh uses relative elevation: the HIGHEST point in the grid maps
 * to y = TERRAIN_Y_OFFSET (just below buildings), everything else is lower.
 * This ensures terrain never pokes above building foundations.
 */
import * as THREE from 'three';

// ── Colour palette ──────────────────────────────────────────────────
const COL_DEEP  = new THREE.Color(0x0a0e1a);  // lowest valleys — near-black
const COL_LOW   = new THREE.Color(0x0f1a2e);  // low terrain — dark navy
const COL_MID   = new THREE.Color(0x1a2a3a);  // mid terrain — dark blue-grey
const COL_HIGH  = new THREE.Color(0x2a3a4a);  // high terrain — lighter grey-blue

// ── Constants ───────────────────────────────────────────────────────
const EARTH_R = 6378137;           // WGS-84 Earth radius (metres)
const TERRAIN_Y_OFFSET = -2;       // terrain peak sits 2m below building plane
const MAX_RELIEF = 60;             // max scene-units of vertical relief

/**
 * Lerp between colors based on a 0-1 parameter, using 4 stops.
 */
function terrainColor(t) {
    if (t < 0.33) {
        return new THREE.Color().lerpColors(COL_DEEP, COL_LOW, t / 0.33);
    } else if (t < 0.66) {
        return new THREE.Color().lerpColors(COL_LOW, COL_MID, (t - 0.33) / 0.33);
    } else {
        return new THREE.Color().lerpColors(COL_MID, COL_HIGH, (t - 0.66) / 0.34);
    }
}

/**
 * Build a terrain group from the elevation API response.
 *
 * @param {object} terrainData  – { grid[][], resolution, min_elevation, max_elevation }
 * @param {number[]} cityBbox   – [west, south, east, north] (WGS-84)
 * @param {object} origin       – { lon, lat } centre of projection
 * @returns {THREE.Group}
 */
export function createTerrainGroup(terrainData, cityBbox, origin) {
    const { grid, resolution, min_elevation: minElev, max_elevation: maxElev } = terrainData;
    const [west, south, east, north] = cityBbox;

    const originLon = origin.lon;
    const originLat = origin.lat;
    const cosLat = Math.cos(originLat * Math.PI / 180);
    const elevRange = maxElev - minElev;

    // Adaptive vertical exaggeration (ArcGIS style)
    const rawExag =
        elevRange < 5  ? 8.0 :
        elevRange < 20 ? 4.0 :
        elevRange < 50 ? 2.5 :
        elevRange < 150 ? 1.5 : 1.0;
    const exaggeration = elevRange > 0
        ? Math.min(rawExag, MAX_RELIEF / elevRange)
        : rawExag;

    // ── Build PlaneGeometry-style mesh ──────────────────────────────
    const verts  = [];
    const colors = [];
    const indices = [];

    for (let row = 0; row < resolution; row++) {
        const latFrac = row / (resolution - 1);
        const lat = south + latFrac * (north - south);

        // Same projection as spatial_processor.py
        const z = -((lat - originLat) * (Math.PI / 180) * EARTH_R);

        for (let col = 0; col < resolution; col++) {
            const lonFrac = col / (resolution - 1);
            const lon = west + lonFrac * (east - west);

            const x = (lon - originLon) * (Math.PI / 180) * EARTH_R * cosLat;

            const rawElev = grid[row]?.[col] ?? minElev;
            // Highest point → TERRAIN_Y_OFFSET, everything else lower
            const y = TERRAIN_Y_OFFSET + (rawElev - maxElev) * exaggeration;

            verts.push(x, y, z);

            // Colour gradient based on normalized elevation
            const t = elevRange > 0 ? (rawElev - minElev) / elevRange : 0;
            const c = terrainColor(t);
            colors.push(c.r, c.g, c.b);
        }
    }

    // Triangle indices (two triangles per grid cell)
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

    // ── Solid terrain surface ───────────────────────────────────────
    const group = new THREE.Group();
    group.name = 'terrain';

    // Main solid surface — opaque, receives shadows, no wireframe
    const solidMat = new THREE.MeshPhongMaterial({
        vertexColors: true,
        flatShading: false,        // smooth interpolation for natural terrain
        shininess: 5,
        side: THREE.DoubleSide,
        depthWrite: true,
    });
    const solidMesh = new THREE.Mesh(geometry, solidMat);
    solidMesh.receiveShadow = true;
    solidMesh.renderOrder = -1;    // draw BEFORE buildings/roads
    group.add(solidMesh);

    // Subtle edge lines for grid visibility (very faint)
    const edgeMat = new THREE.MeshBasicMaterial({
        color: 0x1a2a3a,
        wireframe: true,
        transparent: true,
        opacity: 0.08,
        depthWrite: false,
    });
    const edgeMesh = new THREE.Mesh(geometry.clone(), edgeMat);
    edgeMesh.renderOrder = -1;
    group.add(edgeMesh);

    return group;
}
