/**
 * buildingWorker.js — Off-main-thread building geometry construction.
 *
 * Coordinate system (set by Python spatial_processor.py, already projected):
 *   ring[i][0] → world X  (east-west, metres from bbox centre)
 *   ring[i][1] → world Z via negation (matches ringToShape + rotateX(-PI/2))
 *   height      → world Y  (up, raw metres)
 *
 * HEIGHT_BANDS: exact HSL values from original buildingGeometry.js converted
 * to linear RGB so they work without THREE.Color.setHSL():
 *
 *   h:0.60, s:0.15, l:0.55  → RGB (0.494, 0.506, 0.633)  slate blue-grey
 *   h:0.58, s:0.18, l:0.62  → RGB (0.545, 0.558, 0.713)  steel blue
 *   h:0.56, s:0.22, l:0.68  → RGB (0.598, 0.612, 0.782)  lighter blue
 *   h:0.54, s:0.25, l:0.75  → RGB (0.656, 0.667, 0.844)  bright blue-white
 *
 * Conversion formula: standard HSL→RGB, hue in [0,1].
 */

// HSL → RGB helper (matches THREE.Color.setHSL exactly)
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return { r, g, b };
}

// Exact HEIGHT_BANDS from original buildingGeometry.js (HSL → RGB pre-computed)
// BUG 2 FIX: Use original blue-grey palette, not neutral grey
const HEIGHT_BANDS = [
    { max: 8,        ...hslToRgb(0.60, 0.15, 0.55) }, // Low      — slate blue-grey
    { max: 20,       ...hslToRgb(0.58, 0.18, 0.62) }, // Medium   — steel blue
    { max: 40,       ...hslToRgb(0.56, 0.22, 0.68) }, // Tall     — lighter blue
    { max: Infinity, ...hslToRgb(0.54, 0.25, 0.75) }, // High-rise — bright blue-white
];

function getBuildingColor(height) {
    return HEIGHT_BANDS.find(b => height <= b.max) || HEIGHT_BANDS[HEIGHT_BANDS.length - 1];
}

/**
 * Append one box into flat typed-array buffers.
 * 5 faces × 4 verts = 20 verts per building (no bottom face — hidden by ground).
 * Unshared vertices → hard normals per face → correct Phong shading.
 * Top face gets +12% brightness to match original's lighter roof look.
 */
function buildBox(cx, cy, w, d, height, r, g, bCol, positions, normals, colors, indices, vertexOffset) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const z0 = -cy - d / 2, z1 = -cy + d / 2;
    const y0 = 0, y1 = height;

    // Top-face brighter tint (matches original emissive/lighter roof shading)
    const tr = Math.min(r * 1.12, 1.0);
    const tg = Math.min(g * 1.12, 1.0);
    const tb = Math.min(bCol * 1.12, 1.0);

    const faces = [
        { v: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [ 0, 0, 1], cr: r,  cg: g,    cb: bCol },
        { v: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], n: [ 0, 0,-1], cr: r,  cg: g,    cb: bCol },
        { v: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], n: [-1, 0, 0], cr: r,  cg: g,    cb: bCol },
        { v: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], n: [ 1, 0, 0], cr: r,  cg: g,    cb: bCol },
        { v: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], n: [ 0, 1, 0], cr: tr, cg: tg,   cb: tb  },
    ];

    for (const face of faces) {
        const b = vertexOffset;
        for (const [vx, vy, vz] of face.v) {
            positions.push(vx, vy, vz);
            normals.push(face.n[0], face.n[1], face.n[2]);
            colors.push(face.cr, face.cg, face.cb);
        }
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

    const positions = [], normals = [], colors = [], indices = [];
    const buildingRanges = [];
    let vertexOffset = 0, validCount = 0, skipped = 0;

    for (let fi = 0; fi < buildings.length; fi++) {
        const feature = buildings[fi];
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) { skipped++; continue; }

        const props = feature.properties || {};

        // ── BUG 1 FIX: Correct field names matching schema_normalizer.py ──────
        //
        // schema_normalizer.py _normalize_properties() always writes:
        //   props["height"]          = _safe_float(tags.get("height")) ?? (levels * 3.5)
        //   props["building_levels"] = _safe_int(tags.get("building:levels")) ?? 3
        //
        // So props.height is ALWAYS present and already computed correctly.
        // The problem: for Indian cities, OSM has almost no "height" tags —
        // building:levels is present instead. The normalizer correctly computes
        // height = building:levels * 3.5, BUT if building:levels is also absent,
        // it defaults to DEFAULT_BUILDING_LEVELS (3) → height = 10.5 for every building.
        //
        // To restore height variation, we must honour building_levels when the
        // height is only the default fallback (10.5). Real heights from OSM are
        // preserved as-is. building_levels data overrides the 10.5 default.
        //
        // parseH: safe numeric parser, rejects 0/NaN/null
        const parseH = (v) => {
            if (v === null || v === undefined || v === '') return null;
            const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
            return (!isNaN(n) && n > 0) ? n : null;
        };

        const osmHeight  = parseH(props.height);         // from "height" OSM tag
        const osmLevels  = parseH(props.building_levels); // from "building:levels" OSM tag
        //   ↑ schema_normalizer.py key is "building_levels" (confirmed above)

        // Priority: real OSM height > levels-derived > absolute fallback
        // We treat osmHeight == 10.5 as "probably default, prefer levels if present"
        // because normalizer sets DEFAULT=10.5 when no height tag exists.
        let height;
        if (osmHeight && osmHeight !== 10.5) {
            // Explicit OSM "height" tag was present — use it directly
            height = osmHeight;
        } else if (osmLevels) {
            // OSM "building:levels" tag was present — derive height
            // 3.5m per floor (matches DEFAULT_LEVEL_HEIGHT_M in schema_normalizer.py)
            height = osmLevels * 3.5;
        } else {
            // No height or level data in OSM — use fallback
            height = osmHeight || 10.5;
        }

        // Clamp: min 4m (always visible), max 500m (Burj Khalifa)
        height = Math.min(Math.max(height, 4), 500);

        // ── Footprint AABB ────────────────────────────────────────────────────
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

        // Cap oversized footprints (airports/warehouses with huge OSM polygons)
        const MAX_FOOTPRINT = 400;
        const w = Math.min(rawW, MAX_FOOTPRINT);
        const d = Math.min(rawD, MAX_FOOTPRINT);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        // BUG 2 FIX: use original HEIGHT_BANDS (blue-grey HSL palette)
        const { r, g, b } = getBuildingColor(height);

        const rangeStart = indices.length;
        vertexOffset = buildBox(cx, cy, w, d, height, r, g, b,
                                positions, normals, colors, indices, vertexOffset);

        buildingRanges.push({
            start:       rangeStart,
            count:       indices.length - rangeStart,
            featureIndex: fi,
            osmId:       props.osm_id,
            height,
            levels:      osmLevels || Math.max(Math.round(height / 3.5), 1),
            name:        props.display_name || props.name || null,
            building:    props.building_type || props.building || 'yes',
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
