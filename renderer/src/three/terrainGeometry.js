/**
 * terrainGeometry.js — Solid terrain mesh from elevation grid data.
 *
 * ArcGIS-inspired approach:
 *   • Terrain is a solid ground surface that buildings sit ON TOP of
 *   • Uses the SAME projection as spatial_processor.py
 *   • Highest elevation → y = 0 (flush with building foundations)
 *   • Everything else → negative y (below buildings)
 *   • Dark colour palette that doesn't compete with city geometry
 *   • renderOrder = -1 → draws behind everything
 *
 * Coordinate system (matches Python spatial_processor.py):
 *   x = (lon - originLon) * (π/180) * R * cos(originLat)
 *   z = -((lat - originLat) * (π/180) * R)
 *   y = elevation (up)
 */
import * as THREE from 'three';

// ── Constants ───────────────────────────────────────────────────────
const EARTH_R = 6378137;           // WGS-84 Earth radius (metres)
const TERRAIN_Y_OFFSET = -1;       // peak sits 1m below building plane (y=0)
const MAX_RELIEF = 60;             // max scene-units vertical relief

// ── Terrain colour palette ──────────────────────────────────────────
const COL_DEEP = new THREE.Color(0x0a1a12);  // deep valleys — dark teal
const COL_LOW  = new THREE.Color(0x122a1a);  // low terrain — forest
const COL_MID  = new THREE.Color(0x1a3020);  // mid elevation — muted green
const COL_HIGH = new THREE.Color(0x263828);  // ridges/peaks — lighter green
const COL_FLAT = new THREE.Color(0x0e1e14);  // uniform color for flat terrain

function terrainColor(t, isFlat) {
    if (isFlat) return COL_FLAT.clone();
    if (t < 0.33) return new THREE.Color().lerpColors(COL_DEEP, COL_LOW, t / 0.33);
    if (t < 0.66) return new THREE.Color().lerpColors(COL_LOW, COL_MID, (t - 0.33) / 0.33);
    return new THREE.Color().lerpColors(COL_MID, COL_HIGH, (t - 0.66) / 0.34);
}

// ── Grid size for terrain mesh ──────────────────────────────────────
const GRID_SIZE = 48;              // 48×48 = 2304 points, ~24 API calls
const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 200;        // polite delay between API requests

/**
 * Fetch elevation grid directly from Open-Meteo API (no sidecar needed).
 * This runs in the renderer process — Open-Meteo has no CORS restrictions
 * and Electron allows all origins.
 *
 * @param {number[]} bbox  – [west, south, east, north] WGS-84
 * @returns {Promise<object>} – { grid[][], resolution, min_elevation, max_elevation }
 */
export async function fetchTerrainData(bbox) {
    const [west, south, east, north] = bbox;
    const resolution = GRID_SIZE;

    // Generate grid of lat/lon sample points
    const lats = [];
    const lons = [];
    for (let i = 0; i < resolution; i++) {
        lats.push(south + (north - south) * i / (resolution - 1));
        lons.push(west + (east - west) * i / (resolution - 1));
    }

    // Flatten to row-major list: (lat0,lon0), (lat0,lon1), ..., (lat1,lon0), ...
    const points = [];
    for (const lat of lats) {
        for (const lon of lons) {
            points.push({ lat, lon });
        }
    }

    console.log(`[terrain] Fetching ${resolution}×${resolution} elevation grid (${points.length} points)...`);

    // Fetch in batches of BATCH_SIZE
    const elevations = [];
    let lastValid = 0;

    for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);
        const latCSV = batch.map(p => p.lat.toFixed(6)).join(',');
        const lonCSV = batch.map(p => p.lon.toFixed(6)).join(',');

        try {
            const resp = await fetch(
                `${OPEN_METEO_URL}?latitude=${latCSV}&longitude=${lonCSV}`
            );
            if (resp.ok) {
                const data = await resp.json();
                const batchElevs = data.elevation || [];
                for (const e of batchElevs) {
                    if (e !== null && e === e) { // not null, not NaN
                        lastValid = e;
                        elevations.push(e);
                    } else {
                        elevations.push(lastValid);
                    }
                }
            } else {
                console.warn(`[terrain] API returned ${resp.status} for batch ${i}`);
                elevations.push(...new Array(batch.length).fill(lastValid));
            }
        } catch (err) {
            console.warn(`[terrain] Batch ${i} failed:`, err.message);
            elevations.push(...new Array(batch.length).fill(lastValid));
        }

        // Polite delay between batches to avoid 429 rate limiting
        if (i + BATCH_SIZE < points.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    // Reshape into 2D grid (row 0 = south, row N-1 = north)
    const grid = [];
    for (let row = 0; row < resolution; row++) {
        grid.push(elevations.slice(row * resolution, (row + 1) * resolution));
    }

    const flat = elevations;
    const minElev = Math.min(...flat);
    const maxElev = Math.max(...flat);

    console.log(`[terrain] Elevation range: ${minElev.toFixed(1)}m – ${maxElev.toFixed(1)}m (Δ${(maxElev - minElev).toFixed(1)}m)`);

    return {
        grid,
        resolution,
        min_elevation: minElev,
        max_elevation: maxElev,
    };
}

/**
 * Build a solid terrain mesh from elevation grid data.
 *
 * @param {object} terrainData  – { grid[][], resolution, min_elevation, max_elevation }
 * @param {number[]} cityBbox   – [west, south, east, north] WGS-84
 * @param {object} origin       – { lon, lat } projection origin
 * @returns {THREE.Group}
 */
export function createTerrainGroup(terrainData, cityBbox, origin) {
    const { grid, resolution, min_elevation: minElev, max_elevation: maxElev } = terrainData;
    const [west, south, east, north] = cityBbox;

    const originLon = origin.lon;
    const originLat = origin.lat;
    const cosLat = Math.cos(originLat * Math.PI / 180);
    const elevRange = maxElev - minElev;

    // Subtle exaggeration — terrain sits just below buildings (y=0)
    // Buildings stay at y=0, terrain peak at TERRAIN_Y_OFFSET (-1)
    // Keep relief subtle so buildings don't need per-building offsets
    const TARGET_RELIEF = 15;   // max scene-units of vertical displacement
    const exaggeration = elevRange > 0
        ? Math.min(TARGET_RELIEF / elevRange, 6.0)
        : 0;

    console.log(`[terrain] Exaggeration: ${exaggeration.toFixed(2)}x, range: ${elevRange}m, ` +
        `visual relief: ${(elevRange * exaggeration).toFixed(0)} scene units`);

    // ── Build vertices ──────────────────────────────────────────────
    const verts  = [];
    const colors = [];
    const indices = [];

    const isFlat = elevRange < 1;  // less than 1m elevation change
    const midElev = (minElev + maxElev) / 2;  // center elevation

    for (let row = 0; row < resolution; row++) {
        const latFrac = row / (resolution - 1);   // 0=south, 1=north
        const lat = south + latFrac * (north - south);

        // EXACT same projection as spatial_processor.py
        const z = -((lat - originLat) * (Math.PI / 180) * EARTH_R);

        for (let col = 0; col < resolution; col++) {
            const lonFrac = col / (resolution - 1);  // 0=west, 1=east
            const lon = west + lonFrac * (east - west);

            const x = (lon - originLon) * (Math.PI / 180) * EARTH_R * cosLat;

            const rawElev = grid[row]?.[col] ?? minElev;
            // Highest point → TERRAIN_Y_OFFSET (just below buildings at y=0)
            // Everything else drops DOWN from there
            const y = TERRAIN_Y_OFFSET + (rawElev - maxElev) * exaggeration;

            verts.push(x, y, z);

            // Colour by normalized elevation
            const t = elevRange > 0 ? (rawElev - minElev) / elevRange : 0.5;
            const c = terrainColor(t, isFlat);
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

    // ── Create group with solid + subtle edge meshes ────────────────
    const group = new THREE.Group();
    group.name = 'terrain';

    // Solid ground surface
    const solidMat = new THREE.MeshPhongMaterial({
        vertexColors: true,
        flatShading: false,      // smooth for natural terrain look
        shininess: 10,
        emissive: new THREE.Color(0x0a150a),  // slight green self-glow
        side: THREE.DoubleSide,
        depthWrite: true,
    });
    const solidMesh = new THREE.Mesh(geometry, solidMat);
    solidMesh.receiveShadow = true;
    solidMesh.renderOrder = -1;   // draw BEFORE buildings
    group.add(solidMesh);

    // Subtle grid lines for depth perception
    const edgeMat = new THREE.MeshBasicMaterial({
        color: 0x2a4a3a,
        wireframe: true,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
    });
    const edgeMesh = new THREE.Mesh(geometry.clone(), edgeMat);
    edgeMesh.renderOrder = -1;
    group.add(edgeMesh);

    return group;
}
