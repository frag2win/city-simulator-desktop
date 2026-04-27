/**
 * buildingWorker.js — Off-main-thread building geometry construction.
 * Receives projected GeoJSON features (coords already in local Cartesian meters
 * from Python spatial_processor.py web_mercator_project), returns transferable
 * typed arrays (zero-copy) back to main thread.
 *
 * Coordinate system (matches original buildingGeometry.js + ringToShape):
 *   ring[i][0] → world X  (east-west, meters from origin)
 *   ring[i][1] → world Z via negation (-Y → -Z, matches rotateX(-PI/2))
 *   height      → world Y  (up)
 *
 * Strategy: box extrusion per footprint using UNSHARED vertices.
 * 5 visible faces × 4 vertices = 20 vertices per box (no bottom face needed).
 * Each face carries its own hard normal → correct per-fragment shading.
 */

// Height → explicit colour bands matching the original buildingGeometry.js palette
// (HSL blue-gray tones: h≈0.57, low saturation, medium-high lightness)
function getBuildingColor(height) {
    // Short buildings
    if (height < 8)  return { r: 0.72, g: 0.74, b: 0.78 }; // slate grey
    if (height < 20) return { r: 0.80, g: 0.82, b: 0.86 }; // steel
    if (height < 40) return { r: 0.87, g: 0.88, b: 0.91 }; // light steel
    return               { r: 0.93, g: 0.94, b: 0.97 }; // near white (high-rise)
}

/**
 * Append one box's geometry into the pre-allocated flat arrays.
 * cx, cy are world X and Y (geographic Y, negated below to get world Z).
 * w, d are footprint width (X) and depth (Y in geographic coords = Z in world).
 * Returns the new vertexOffset.
 */
function buildBox(cx, cy, w, d, height, r, g, bCol, positions, normals, colors, indices, vertexOffset) {
    // World-space corners — note: geographic Y → world -Z (matches ringToShape + rotateX)
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const z0 = -cy - d / 2, z1 = -cy + d / 2;
    const y0 = 0, y1 = height;

    // Top face gets +15% brightness
    const tr = Math.min(r * 1.15, 1);
    const tg = Math.min(g * 1.15, 1);
    const tb = Math.min(bCol * 1.15, 1);

    // 5 faces, 4 verts each (no bottom face — hidden by ground plane)
    const faces = [
        // Front  (+Z)
        { v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1], fr: r,  fg: g,    fb: bCol },
        // Back   (-Z)
        { v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], n: [ 0, 0,-1], fr: r,  fg: g,    fb: bCol },
        // Left   (-X)
        { v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], n: [-1, 0, 0], fr: r,  fg: g,    fb: bCol },
        // Right  (+X)
        { v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], n: [ 1, 0, 0], fr: r,  fg: g,    fb: bCol },
        // Top    (+Y)
        { v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], n: [ 0, 1, 0], fr: tr, fg: tg,   fb: tb  },
    ];

    for (const face of faces) {
        const b = vertexOffset;
        for (const [vx, vy, vz] of face.v) {
            positions.push(vx, vy, vz);
            normals.push(face.n[0], face.n[1], face.n[2]);
            colors.push(face.fr, face.fg, face.fb);
        }
        // Two CCW triangles per quad
        indices.push(b, b+1, b+2,  b, b+2, b+3);
        vertexOffset += 4;
    }
    return vertexOffset;
}

self.onmessage = function (e) {
    const { features } = e.data;

    const buildings = features.filter(
        f => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    const positions = [];
    const normals   = [];
    const colors    = [];
    const indices   = [];
    const buildingRanges = [];

    let vertexOffset = 0;
    let validCount   = 0;
    let skipped      = 0;

    for (let fi = 0; fi < buildings.length; fi++) {
        const feature = buildings[fi];
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) { skipped++; continue; }

        const props = feature.properties || {};

        // ── BUG 2 FIX: Robust height extraction ──────────────────────────
        // OSM sometimes gives "10 m", "10.5", 0 (string or number).
        // props.height is set by schema_normalizer.py's _normalize_properties
        // as: height = _safe_float(tags.get("height")) or levels * 3.5
        // So props.height is already in metres, never a string with units.
        const parseH = (v) => {
            if (v === null || v === undefined) return null;
            const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
            return (isNaN(n) || n <= 0) ? null : n;
        };
        const rawH =
            parseH(props.height) ||
            parseH(props.building_height) ||
            (parseH(props.building_levels) != null ? parseH(props.building_levels) * 3.5 : null) ||
            (parseH(props.levels) != null ? parseH(props.levels) * 3.5 : null) ||
            10.5; // absolute fallback — never render flat
        // clamp: min 4m (single storey visible), max 500m (Burj Khalifa)
        const height = Math.min(Math.max(rawH, 4), 500);

        // ── Footprint AABB ────────────────────────────────────────────────
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const pt of ring) {
            const x = pt[0], y = pt[1];
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (!isFinite(minX) || !isFinite(minY)) { skipped++; continue; }

        const rawW = Math.max(maxX - minX, 2);
        const rawD = Math.max(maxY - minY, 2);

        // ── BUG 2 FIX: Cap oversized footprints ──────────────────────────
        // Airport terminals, warehouses etc. can have BBOX > 1 km.
        // Real buildings: max ~400m in any axis. Anything larger = OSM
        // landuse/apron polygon mis-tagged as building. Cap to prevent one
        // building covering entire city districts.
        const MAX_FOOTPRINT = 400; // metres
        const w = Math.min(rawW, MAX_FOOTPRINT);
        const d = Math.min(rawD, MAX_FOOTPRINT);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        // ── BUG 2 FIX: Explicit colour bands (no edge-case blue) ──────────
        const { r, g, b } = getBuildingColor(height);

        const rangeStart = indices.length;
        vertexOffset = buildBox(cx, cy, w, d, height, r, g, b,
                                positions, normals, colors, indices, vertexOffset);

        buildingRanges.push({
            start: rangeStart,
            count: indices.length - rangeStart,
            featureIndex: fi,
            osmId: props.osm_id,
            height,
            levels: parseH(props.building_levels) || parseH(props.levels) ||
                    Math.max(Math.round(height / 3.5), 1),
            name: props.display_name || props.name || null,
            building: props.building_type || props.building || 'yes',
        });

        validCount++;
    }

    const posArr = new Float32Array(positions);
    const nrmArr = new Float32Array(normals);
    const colArr = new Float32Array(colors);
    const idxArr = new Uint32Array(indices);

    self.postMessage(
        { posArr, nrmArr, colArr, idxArr, buildingRanges, validCount, skipped },
        [posArr.buffer, nrmArr.buffer, colArr.buffer, idxArr.buffer]
    );
};
