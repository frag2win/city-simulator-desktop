/**
 * buildingWorker.js — Off-main-thread building geometry construction.
 *
 * Coordinate system (set by Python spatial_processor.py, already projected):
 *   ring[i][0] → world X  (east-west, metres from bbox centre)
 *   ring[i][1] → world -Z (matches ringToShape + rotateX(-PI/2))
 *   height      → world Y  (up, raw metres)
 *
 * Uses REAL polygon footprint extrusion (ear-clipping triangulation for the
 * roof + per-edge wall quads) instead of axis-aligned bounding boxes.
 * This matches the original buildingGeometry.js approach of ExtrudeGeometry.
 */

// ── HSL → RGB (matches THREE.Color.setHSL) ──────────────────────────────────
function hslToRgb(h, s, l) {
    if (s === 0) return { r: l, g: l, b: l };
    const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1; if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return { r: hue2rgb(p, q, h + 1/3), g: hue2rgb(p, q, h), b: hue2rgb(p, q, h - 1/3) };
}

// Exact HEIGHT_BANDS from original buildingGeometry.js
const HEIGHT_BANDS = [
    { max: 8,        ...hslToRgb(0.60, 0.15, 0.55) },
    { max: 20,       ...hslToRgb(0.58, 0.18, 0.62) },
    { max: 40,       ...hslToRgb(0.56, 0.22, 0.68) },
    { max: Infinity, ...hslToRgb(0.54, 0.25, 0.75) },
];

function getBuildingColor(height) {
    return HEIGHT_BANDS.find(b => height <= b.max) || HEIGHT_BANDS[3];
}

// ── Ear-clipping triangulation ───────────────────────────────────────────────
// Triangulates a simple 2D polygon. Input: [[x,y],...] in CCW order, no dups.
// Returns flat array of vertex indices (triples).

function signedArea2D(pts) {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return area * 0.5;
}

function cross2D(ax, ay, bx, by) { return ax * by - ay * bx; }

function isConvex(a, b, c) {
    return cross2D(b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]) > 0;
}

function pointInTriangle(p, a, b, c) {
    const d1 = cross2D(b[0]-a[0], b[1]-a[1], p[0]-a[0], p[1]-a[1]);
    const d2 = cross2D(c[0]-b[0], c[1]-b[1], p[0]-b[0], p[1]-b[1]);
    const d3 = cross2D(a[0]-c[0], a[1]-c[1], p[0]-c[0], p[1]-c[1]);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function earClip(pts) {
    const n = pts.length;
    if (n < 3) return [];
    if (n === 3) return [0, 1, 2];

    const idx = Array.from({ length: n }, (_, i) => i);
    const tris = [];
    let safety = n * n; // more generous safety limit for complex polygons

    while (idx.length > 3 && safety-- > 0) {
        let found = false;
        const len = idx.length;
        for (let i = 0; i < len; i++) {
            const a = idx[(i - 1 + len) % len];
            const b = idx[i];
            const c = idx[(i + 1) % len];

            // Use small epsilon for convexity — handles near-collinear edges
            const cross = cross2D(
                pts[b][0] - pts[a][0], pts[b][1] - pts[a][1],
                pts[c][0] - pts[a][0], pts[c][1] - pts[a][1]
            );
            if (cross < 1e-10) continue; // reflex or collinear — not an ear

            let inside = false;
            for (let j = 0; j < len; j++) {
                const v = idx[j];
                if (v === a || v === b || v === c) continue;
                if (pointInTriangle(pts[v], pts[a], pts[b], pts[c])) { inside = true; break; }
            }
            if (inside) continue;

            tris.push(a, b, c);
            idx.splice(i, 1);
            found = true;
            break;
        }
        if (!found) {
            // Ear-clipping stalled — fall back to fan triangulation for remainder
            // This produces SOME triangles instead of leaving holes in the roof
            for (let i = 1; i < idx.length - 1; i++) {
                tris.push(idx[0], idx[i], idx[i + 1]);
            }
            break;
        }
    }
    if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
    return tris;
}

// ── Polygon extrusion ────────────────────────────────────────────────────────
// Builds roof (triangulated polygon) + wall quads per edge.
// Returns updated vertexOffset.

function extrudePolygon(ring, height, r, g, bCol, positions, normals, colors, indices, vertexOffset, yOffset = 0) {
    // Prepare 2D polygon — remove closing duplicate
    let pts = ring.map(p => [p[0], p[1]]);
    if (pts.length > 1 &&
        Math.abs(pts[0][0] - pts[pts.length-1][0]) < 0.01 &&
        Math.abs(pts[0][1] - pts[pts.length-1][1]) < 0.01) {
        pts.pop();
    }

    // Deduplicate consecutive coincident vertices (matches original ringToShape)
    const deduped = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
        const prev = deduped[deduped.length - 1];
        if (Math.abs(pts[i][0] - prev[0]) > 0.01 || Math.abs(pts[i][1] - prev[1]) > 0.01) {
            deduped.push(pts[i]);
        }
    }
    pts = deduped;
    if (pts.length < 3) return vertexOffset;

    // Signed area check — skip zero-area polygons (matches original)
    const area = signedArea2D(pts);
    if (Math.abs(area) < 0.5) return vertexOffset;

    // Ensure CCW winding for correct face normals
    if (area < 0) pts.reverse();

    const n = pts.length;

    // Roof brightness boost (matches original emissive look)
    const tr = Math.min(r * 1.12, 1.0);
    const tg = Math.min(g * 1.12, 1.0);
    const tb = Math.min(bCol * 1.12, 1.0);

    // ── ROOF FACE (triangulated) ──────────────────────────────────────────
    const roofTris = earClip(pts);
    const roofBase = vertexOffset;

    for (let i = 0; i < n; i++) {
        positions.push(pts[i][0], yOffset + height, -pts[i][1]);
        normals.push(0, 1, 0);
        colors.push(tr, tg, tb);
    }
    vertexOffset += n;

    for (let i = 0; i < roofTris.length; i += 3) {
        indices.push(roofBase + roofTris[i], roofBase + roofTris[i+1], roofBase + roofTris[i+2]);
    }

    // ── WALL QUADS (one per polygon edge) ─────────────────────────────────
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = pts[i][0], y0 = pts[i][1];
        const x1 = pts[j][0], y1 = pts[j][1];

        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.001) continue;

        // Outward wall normal for CCW polygon: geographic (dy,-dx) → world (dy, 0, dx)
        const nx = dy / len, nz = dx / len;

        const wz0 = -y0, wz1 = -y1;
        const b = vertexOffset;

        // BL, BR, TR, TL
        positions.push(x0, yOffset, wz0,  x1, yOffset, wz1,  x1, yOffset + height, wz1,  x0, yOffset + height, wz0);
        normals.push(nx,0,nz, nx,0,nz, nx,0,nz, nx,0,nz);
        colors.push(r,g,bCol, r,g,bCol, r,g,bCol, r,g,bCol);
        indices.push(b, b+1, b+2,  b, b+2, b+3);
        vertexOffset += 4;
    }

    return vertexOffset;
}

// ── AABB fallback for degenerate polygons ────────────────────────────────────
function buildBoxFallback(ring, height, r, g, bCol, positions, normals, colors, indices, vertexOffset, yOffset = 0) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const pt of ring) {
        if (!isFinite(pt[0]) || !isFinite(pt[1])) continue;
        if (pt[0] < minX) minX = pt[0]; if (pt[0] > maxX) maxX = pt[0];
        if (pt[1] < minY) minY = pt[1]; if (pt[1] > maxY) maxY = pt[1];
    }
    const w = Math.min(Math.max(maxX - minX, 2), 400);
    const d = Math.min(Math.max(maxY - minY, 2), 400);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;

    const x0 = cx - w/2, x1 = cx + w/2;
    const z0 = -cy - d/2, z1 = -cy + d/2;
    const tr = Math.min(r*1.12,1), tg = Math.min(g*1.12,1), tb = Math.min(bCol*1.12,1);

    const faces = [
        { v:[[x0,yOffset,z1],[x1,yOffset,z1],[x1,yOffset+height,z1],[x0,yOffset+height,z1]], n:[0,0,1],   cr:r,cg:g,cb:bCol },
        { v:[[x1,yOffset,z0],[x0,yOffset,z0],[x0,yOffset+height,z0],[x1,yOffset+height,z0]], n:[0,0,-1],  cr:r,cg:g,cb:bCol },
        { v:[[x0,yOffset,z0],[x0,yOffset,z1],[x0,yOffset+height,z1],[x0,yOffset+height,z0]], n:[-1,0,0],  cr:r,cg:g,cb:bCol },
        { v:[[x1,yOffset,z1],[x1,yOffset,z0],[x1,yOffset+height,z0],[x1,yOffset+height,z1]], n:[1,0,0],   cr:r,cg:g,cb:bCol },
        { v:[[x0,yOffset+height,z1],[x1,yOffset+height,z1],[x1,yOffset+height,z0],[x0,yOffset+height,z0]], n:[0,1,0], cr:tr,cg:tg,cb:tb },
    ];
    for (const f of faces) {
        const b = vertexOffset;
        for (const [vx,vy,vz] of f.v) { positions.push(vx,vy,vz); normals.push(...f.n); colors.push(f.cr,f.cg,f.cb); }
        indices.push(b,b+1,b+2, b,b+2,b+3);
        vertexOffset += 4;
    }
    return vertexOffset;
}

// ── Terrain height lookup ────────────────────────────────────────────────────
// Samples terrain Y offset at a given scene-space (x, z) position.
// Uses bilinear interpolation from the elevation grid.
const EARTH_R = 6378137;

function getTerrainY(sceneX, sceneZ, terrainInfo) {
    if (!terrainInfo) return 0;
    const { grid, resolution, minElev, maxElev, bbox, origin, exaggeration, terrainYOffset } = terrainInfo;
    const [west, south, east, north] = bbox;
    // Use the exact same origin as the spatial_processor & terrain mesh
    const originLon = origin ? origin.lon : (west + east) / 2;
    const originLat = origin ? origin.lat : (south + north) / 2;
    const cosLat = Math.cos(originLat * Math.PI / 180);

    // Reverse the Mercator projection to get lat/lon from scene x/z
    // x = (lon - originLon) * (PI/180) * EARTH_R * cosLat
    // z = -((lat - originLat) * (PI/180) * EARTH_R)
    const lon = originLon + sceneX / ((Math.PI / 180) * EARTH_R * cosLat);
    const lat = originLat - sceneZ / ((Math.PI / 180) * EARTH_R);

    // Map lat/lon to grid coordinates
    const colFrac = (lon - west) / (east - west) * (resolution - 1);
    const rowFrac = (lat - south) / (north - south) * (resolution - 1);

    // Clamp to grid bounds
    const col0 = Math.max(0, Math.min(Math.floor(colFrac), resolution - 2));
    const row0 = Math.max(0, Math.min(Math.floor(rowFrac), resolution - 2));
    const col1 = col0 + 1;
    const row1 = row0 + 1;

    const fc = colFrac - col0;
    const fr = rowFrac - row0;

    // Bilinear interpolation
    const h00 = (grid[row0] && grid[row0][col0]) || 0;
    const h10 = (grid[row0] && grid[row0][col1]) || 0;
    const h01 = (grid[row1] && grid[row1][col0]) || 0;
    const h11 = (grid[row1] && grid[row1][col1]) || 0;

    const rawElev = h00 * (1-fr)*(1-fc) + h10 * (1-fr)*fc + h01 * fr*(1-fc) + h11 * fr*fc;

    // Must match terrainGeometry.js formula exactly:
    // y = TERRAIN_Y_OFFSET + (rawElev - maxElev) * exaggeration
    return terrainYOffset + (rawElev - maxElev) * exaggeration;
}

// ── Main message handler ─────────────────────────────────────────────────────
self.onmessage = function (e) {
    const { features, terrainInfo } = e.data;

    const buildings = features.filter(
        f => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    const positions = [], normals = [], colors = [], indices = [];
    const buildingRanges = [];
    let vertexOffset = 0, validCount = 0, skipped = 0, fallbacks = 0;

    for (let fi = 0; fi < buildings.length; fi++) {
        const feature = buildings[fi];
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) { skipped++; continue; }

        const props = feature.properties || {};

        // Height resolution (field names match schema_normalizer.py exactly)
        const parseH = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
            return (!isNaN(n) && n > 0) ? n : null;
        };

        const osmHeight = parseH(props.height);
        const osmLevels = parseH(props.building_levels);

        let height;
        if (osmHeight && osmHeight !== 10.5) {
            height = osmHeight;
        } else if (osmLevels) {
            height = osmLevels * 3.5;
        } else {
            height = osmHeight || 10.5;
        }
        height = Math.min(Math.max(height, 4), 500);

        // Compute building centroid in scene space for terrain sampling
        let cx = 0, cy = 0;
        const validPts = ring.length - 1; // exclude closing duplicate
        for (let i = 0; i < validPts; i++) {
            cx += ring[i][0];
            cy += ring[i][1];
        }
        cx /= validPts;
        cy /= validPts;
        // scene z = -cy (building coords: ring[i][1] maps to -z in scene)
        const yOffset = getTerrainY(cx, -cy, terrainInfo);

        const { r, g, b } = getBuildingColor(height);

        const rangeStart = indices.length;
        const prevOffset = vertexOffset;

        vertexOffset = extrudePolygon(ring, height, r, g, b,
                                      positions, normals, colors, indices, vertexOffset, yOffset);

        if (vertexOffset === prevOffset) {
            vertexOffset = buildBoxFallback(ring, height, r, g, b,
                                            positions, normals, colors, indices, vertexOffset, yOffset);
            fallbacks++;
        }

        buildingRanges.push({
            start:        rangeStart,
            count:        indices.length - rangeStart,
            featureIndex: fi,
            osmId:        props.osm_id,
            height,
            levels:       osmLevels || Math.max(Math.round(height / 3.5), 1),
            name:         props.display_name || props.name || null,
            building:     props.building_type || props.building || 'yes',
        });

        validCount++;
    }

    const posArr = new Float32Array(positions);
    const nrmArr = new Float32Array(normals);
    const colArr = new Float32Array(colors);
    const idxArr = new Uint32Array(indices);

    console.log(`[worker] ${validCount} extruded, ${fallbacks} fallback, ${skipped} skipped`);

    self.postMessage(
        { posArr, nrmArr, colArr, idxArr, buildingRanges, validCount, skipped },
        [posArr.buffer, nrmArr.buffer, colArr.buffer, idxArr.buffer]
    );
};

