/**
 * buildingWorker.js — Off-main-thread building geometry construction.
 * FIX 0b: Runs in a Web Worker — no THREE.js dependency, pure math.
 * Receives raw OSM features, returns transferable typed arrays (zero-copy).
 *
 * Strategy: fast box extrusion per footprint.
 * The main thread receives Float32Array buffers and builds BufferGeometry.
 */

// Height → RGB color bands (matches buildingGeometry.js HEIGHT_BANDS hue)
const HEIGHT_BANDS = [
    { max: 8,        r: 0.50, g: 0.52, b: 0.58 }, // low — slate
    { max: 20,       r: 0.55, g: 0.57, b: 0.65 }, // medium — steel
    { max: 40,       r: 0.60, g: 0.63, b: 0.72 }, // tall
    { max: Infinity, r: 0.68, g: 0.70, b: 0.80 }, // high-rise
];

function getBand(height) {
    return HEIGHT_BANDS.find(b => height <= b.max) || HEIGHT_BANDS[HEIGHT_BANDS.length - 1];
}

self.onmessage = function (e) {
    const { features } = e.data;

    const buildings = features.filter(
        f => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    // Pre-allocate typed arrays — worst case 8 verts × 3 floats per building
    const maxVerts = buildings.length * 8;
    const positions = new Float32Array(maxVerts * 3);
    const colors    = new Float32Array(maxVerts * 3);
    // Worst case: 10 faces × 3 indices each × per building
    const indices   = new Uint32Array(buildings.length * 30);

    let vOffset = 0; // vertex write cursor (float index / 3)
    let iOffset = 0; // index write cursor
    let validCount = 0;
    let skipped = 0;

    for (const feature of buildings) {
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) { skipped++; continue; }

        const height = Math.max(feature.properties?.height || 10.5, 1);

        // Compute AABB of footprint ring
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const [x, y] of ring) {
            if (!isFinite(x) || !isFinite(y)) continue;
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
        if (!isFinite(minX) || !isFinite(minY)) { skipped++; continue; }

        const w  = Math.max(maxX - minX, 1);
        const d  = Math.max(maxY - minY, 1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const x0 = cx - w / 2, x1 = cx + w / 2;
        const z0 = -cy - d / 2, z1 = -cy + d / 2;

        // 8 box vertices: bottom (0-3) + top (4-7)
        const vBase = vOffset;
        // Bottom ring
        positions[vBase*3+0] = x0; positions[vBase*3+1] = 0;      positions[vBase*3+2] = z0;
        positions[vBase*3+3] = x1; positions[vBase*3+4] = 0;      positions[vBase*3+5] = z0;
        positions[vBase*3+6] = x1; positions[vBase*3+7] = 0;      positions[vBase*3+8] = z1;
        positions[vBase*3+9] = x0; positions[vBase*3+10]= 0;      positions[vBase*3+11]= z1;
        // Top ring
        positions[vBase*3+12]= x0; positions[vBase*3+13]= height; positions[vBase*3+14]= z0;
        positions[vBase*3+15]= x1; positions[vBase*3+16]= height; positions[vBase*3+17]= z0;
        positions[vBase*3+18]= x1; positions[vBase*3+19]= height; positions[vBase*3+20]= z1;
        positions[vBase*3+21]= x0; positions[vBase*3+22]= height; positions[vBase*3+23]= z1;

        const band = getBand(height);
        for (let vi = 0; vi < 8; vi++) {
            colors[(vBase + vi)*3+0] = band.r;
            colors[(vBase + vi)*3+1] = band.g;
            colors[(vBase + vi)*3+2] = band.b;
        }

        const b = vBase;
        // 4 side faces (2 triangles each)
        indices[iOffset++]=b;   indices[iOffset++]=b+4; indices[iOffset++]=b+5;
        indices[iOffset++]=b;   indices[iOffset++]=b+5; indices[iOffset++]=b+1;
        indices[iOffset++]=b+1; indices[iOffset++]=b+5; indices[iOffset++]=b+6;
        indices[iOffset++]=b+1; indices[iOffset++]=b+6; indices[iOffset++]=b+2;
        indices[iOffset++]=b+2; indices[iOffset++]=b+6; indices[iOffset++]=b+7;
        indices[iOffset++]=b+2; indices[iOffset++]=b+7; indices[iOffset++]=b+3;
        indices[iOffset++]=b+3; indices[iOffset++]=b+7; indices[iOffset++]=b+4;
        indices[iOffset++]=b+3; indices[iOffset++]=b+4; indices[iOffset++]=b;
        // Top face
        indices[iOffset++]=b+4; indices[iOffset++]=b+7; indices[iOffset++]=b+6;
        indices[iOffset++]=b+4; indices[iOffset++]=b+6; indices[iOffset++]=b+5;

        vOffset += 8;
        validCount++;
    }

    // Slice to actual used size (avoids transferring unused zeros)
    const posSlice = positions.slice(0, vOffset * 3);
    const colSlice = colors.slice(0, vOffset * 3);
    const idxSlice = indices.slice(0, iOffset);

    self.postMessage(
        { posArr: posSlice, colArr: colSlice, idxArr: idxSlice, validCount, skipped },
        [posSlice.buffer, colSlice.buffer, idxSlice.buffer] // transferable — zero copy
    );
};
