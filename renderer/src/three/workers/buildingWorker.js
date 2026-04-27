/**
 * buildingWorker.js — Off-main-thread building geometry construction.
 * Receives raw OSM features, returns transferable typed arrays (zero-copy).
 *
 * Strategy: fast box extrusion per footprint with UNSHARED vertices.
 * 6 faces × 4 vertices = 24 vertices per box. This allows hard face normals
 * and sharp shading instead of averaged smoothed normals.
 */

// Height → RGB color bands matching target grey/white style
function getBuildingColor(height) {
    const t = Math.min(height / 80, 1);
    const r = 0.55 + t * 0.25;
    const g = 0.55 + t * 0.25;
    const b = 0.58 + t * 0.22;
    return { r, g, b };
}

function buildBox(cx, cy, w, d, height, r, g, bCol, positions, normals, colors, indices, vertexOffset) {
    // 24 unique vertices (4 per face × 6 faces) — enables hard normals per face
    const x0 = cx - w/2, x1 = cx + w/2;
    const z0 = -cy - d/2, z1 = -cy + d/2;
    const y0 = 0, y1 = height;

    const faces = [
        // [4 positions as [x,y,z], normal [nx,ny,nz]]
        // Front face (z1)
        { verts: [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], n: [0,0,1] },
        // Back face (z0)  
        { verts: [[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], n: [0,0,-1] },
        // Left face (x0)
        { verts: [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], n: [-1,0,0] },
        // Right face (x1)
        { verts: [[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], n: [1,0,0] },
        // Top face (y1) — slightly lighter color
        { verts: [[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], n: [0,1,0], topFace: true },
    ];

    for (const face of faces) {
        const b = vertexOffset;
        // lighter tint for top face
        const fr = face.topFace ? Math.min(r * 1.4, 1) : r;
        const fg = face.topFace ? Math.min(g * 1.4, 1) : g;
        const fb = face.topFace ? Math.min(bCol * 1.4, 1) : bCol;

        for (const [vx, vy, vz] of face.verts) {
            positions.push(vx, vy, vz);
            normals.push(...face.n);
            colors.push(fr, fg, fb);
        }
        // 2 triangles per face
        indices.push(b,b+1,b+2, b,b+2,b+3);
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
    const normals = [];
    const colors = [];
    const indices = [];
    const buildingRanges = [];
    let vertexOffset = 0;
    let validCount = 0;
    let skipped = 0;

    for (let fi = 0; fi < buildings.length; fi++) {
        const feature = buildings[fi];
        const ring = feature.geometry.coordinates[0];
        if (!ring || ring.length < 4) { skipped++; continue; }

        // Fallback chain for height field
        const props = feature.properties || {};
        const rawHeight = 
            props.height          ||   // direct OSM height tag
            props.building_height ||   // normalizer renamed field  
            props['building:height'] || // OSM colon key (sometimes passed raw)
            (props.levels ? props.levels * 3.5 : null) ||  // levels × floor height
            (props['building:levels'] ? props['building:levels'] * 3.5 : null) ||
            10.5;                      // absolute fallback
            
        // clamp: min 3m (single storey), max 500m
        const height = Math.min(Math.max(parseFloat(rawHeight) || 10.5, 3), 500);

        let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
        for (const [x,y] of ring) {
            if (!isFinite(x) || !isFinite(y)) continue;
            if(x<minX)minX=x; if(x>maxX)maxX=x;
            if(y<minY)minY=y; if(y>maxY)maxY=y;
        }
        if (!isFinite(minX) || !isFinite(minY)) { skipped++; continue; }

        const w = Math.max(maxX-minX, 2);
        const d = Math.max(maxY-minY, 2);
        const cx = (minX+maxX)/2;
        const cy = (minY+maxY)/2;

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
            levels: props.levels || props['building:levels'] || Math.floor(height / 3.5),
            name: props.name || null,
            building: props.building || 'yes',
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
