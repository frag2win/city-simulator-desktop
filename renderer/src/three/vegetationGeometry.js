/**
 * vegetationGeometry.js — Phase 4: Vegetation & Land Cover
 *
 * Renders:
 *  1. Ground cover polygons (parks, forests, grass) as flat tinted meshes at y=0.03
 *  2. Instanced low-poly trees scattered inside forest/wood/park polygons
 *  3. Individual tree nodes as standalone tree instances
 *
 * Performance notes:
 *  - Ground patches are merged per vegetation type (like zoneGeometry.js)
 *  - Trees use THREE.InstancedMesh for massive instancing (single draw call)
 *  - Tree density is configurable and capped to prevent GPU exhaustion
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ─── Ground Cover Colors ────────────────────────────────────
const GROUND_COLORS = {
    forest: 0x2d5a27,   // Dark forest green
    wood:   0x3a6b33,   // Woodland green
    park:   0x4a8f3f,   // Park green (brighter)
    garden: 0x5a9f4a,   // Garden green (brightest)
    grass:  0x6aaf5a,   // Grass — vibrant light green
    meadow: 0x7ab96a,   // Meadow — warm yellow-green
    scrub:  0x556b2f,   // Scrubland — olive
    orchard:0x5d8a38,   // Orchard — warm green
    default:0x4a8f3f,
};

// ─── Tree Colors ────────────────────────────────────────────
const TRUNK_COLOR  = 0x5c3a1e;
const CANOPY_COLORS = {
    forest:  0x1e6b1e,
    wood:    0x267326,
    park:    0x3a8f3a,
    garden:  0x4a9f4a,
    orchard: 0x4d8c2f,
    tree:    0x2e7d2e,
    default: 0x2e8b2e,
};

// ─── Tree Geometry (built once, reused) ─────────────────────
// Low-poly conical tree: cylinder trunk + cone canopy
let _trunkGeo = null;
let _canopyGeo = null;

function getTrunkGeometry() {
    if (!_trunkGeo) {
        _trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 5);
        _trunkGeo.translate(0, 1.5, 0); // base at y=0
    }
    return _trunkGeo;
}

function getCanopyGeometry() {
    if (!_canopyGeo) {
        _canopyGeo = new THREE.ConeGeometry(2.5, 5, 6);
        _canopyGeo.translate(0, 5.5, 0); // sit on top of trunk
    }
    return _canopyGeo;
}

// ─── Tree density per type (trees per 100m²) ────────────────
const TREE_DENSITY = {
    forest:  0.08,
    wood:    0.06,
    park:    0.03,
    garden:  0.04,
    orchard: 0.05,
    scrub:   0.01,
    meadow:  0.005,
    grass:   0.002,
    default: 0.02,
};

const MAX_TREES_TOTAL = 15000; // Hard cap across entire scene
const MAX_TREES_PER_POLYGON = 500;

/**
 * Create vegetation group containing ground cover + instanced trees.
 */
export function createVegetationGroup(features) {
    const group = new THREE.Group();
    group.name = 'vegetation';

    // Separate polygon features (forests, parks) and point features (individual trees)
    const polyFeatures = features.filter(
        f => f.properties?.osm_type === 'vegetation' &&
             (f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
    );
    const treeNodes = features.filter(
        f => f.properties?.osm_type === 'vegetation' &&
             f.geometry?.type === 'Point' &&
             f.properties?.vegetation_type === 'tree'
    );

    console.log(`[Vegetation] ${polyFeatures.length} polygon features, ${treeNodes.length} tree nodes`);

    // ── 1. Ground Cover Patches ─────────────────────────────
    const groundGroup = buildGroundCover(polyFeatures);
    group.add(groundGroup);

    // ── 2. Instanced Trees ──────────────────────────────────
    const treePositions = [];

    // Scatter trees inside polygons
    for (const feature of polyFeatures) {
        const vegType = feature.properties?.vegetation_type || 'default';
        const density = TREE_DENSITY[vegType] ?? TREE_DENSITY.default;

        // Only scatter in types that should have trees
        if (['grass', 'meadow'].includes(vegType) && density < 0.01) {
            // Very sparse — skip tree scattering for pure grass/meadow unless density is set
        } else {
            const positions = scatterTreesInPolygon(feature, density);
            for (const pos of positions) {
                treePositions.push({ pos, vegType });
            }
        }

        if (treePositions.length >= MAX_TREES_TOTAL) break;
    }

    // Add individual tree nodes
    for (const node of treeNodes) {
        if (treePositions.length >= MAX_TREES_TOTAL) break;
        const [x, y] = node.geometry.coordinates;
        treePositions.push({
            pos: new THREE.Vector3(x, 0, -y),
            vegType: 'tree',
        });
    }

    console.log(`[Vegetation] Scattering ${treePositions.length} trees (cap: ${MAX_TREES_TOTAL})`);

    if (treePositions.length > 0) {
        const treeMeshes = buildInstancedTrees(treePositions);
        group.add(treeMeshes);
    }

    return group;
}

// ─── Ground Cover Builder ───────────────────────────────────
function buildGroundCover(polyFeatures) {
    const groundGroup = new THREE.Group();
    groundGroup.name = 'vegetation-ground';

    // Group by vegetation type
    const geomBuckets = {};
    for (const key of Object.keys(GROUND_COLORS)) {
        geomBuckets[key] = [];
    }

    for (const feature of polyFeatures) {
        const vegType = feature.properties?.vegetation_type || 'default';
        const bucket = geomBuckets[vegType] !== undefined ? vegType : 'default';
        const geoms = polygonToShapeGeometries(feature);
        geomBuckets[bucket].push(...geoms);
    }

    for (const [type, geometries] of Object.entries(geomBuckets)) {
        if (geometries.length === 0) continue;

        try {
            const merged = mergeGeometries(geometries, false);
            if (merged) {
                const mat = new THREE.MeshStandardMaterial({
                    color: GROUND_COLORS[type] ?? GROUND_COLORS.default,
                    roughness: 0.95,
                    metalness: 0.0,
                    transparent: true,
                    opacity: 0.55,
                    side: THREE.DoubleSide,
                    depthWrite: false,
                });
                const mesh = new THREE.Mesh(merged, mat);
                mesh.receiveShadow = true;
                groundGroup.add(mesh);
            }
        } catch (e) {
            console.warn(`[Vegetation] Failed to merge ${type} ground patches:`, e);
        }

        // Free individual geometries
        for (const g of geometries) g.dispose();
    }

    return groundGroup;
}

// ─── Polygon → ShapeGeometry ────────────────────────────────
function polygonToShapeGeometries(feature) {
    const coordsList = feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

    const results = [];

    for (const coords of coordsList) {
        if (!coords?.[0] || coords[0].length < 3) continue;

        const ring = coords[0];
        const pts = [ring[0]];
        for (let i = 1; i < ring.length; i++) {
            const prev = pts[pts.length - 1];
            if (Math.abs(ring[i][0] - prev[0]) > 0.01 || Math.abs(ring[i][1] - prev[1]) > 0.01) {
                pts.push(ring[i]);
            }
        }
        if (pts.length < 3) continue;

        const shape = new THREE.Shape();
        shape.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) {
            shape.lineTo(pts[i][0], pts[i][1]);
        }

        try {
            const geom = new THREE.ShapeGeometry(shape);
            geom.rotateX(-Math.PI / 2);
            geom.translate(0, 0.03, 0); // Just above ground, below roads
            geom.computeVertexNormals();
            results.push(geom);
        } catch {
            // Degenerate polygon, skip
        }
    }

    return results;
}

// ─── Tree Scattering (Poisson-like random within polygon bbox) ──
function scatterTreesInPolygon(feature, density) {
    const coordsList = feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

    const positions = [];

    for (const coords of coordsList) {
        if (!coords?.[0] || coords[0].length < 3) continue;
        const ring = coords[0];

        // Compute bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const pt of ring) {
            if (pt[0] < minX) minX = pt[0];
            if (pt[0] > maxX) maxX = pt[0];
            if (pt[1] < minY) minY = pt[1];
            if (pt[1] > maxY) maxY = pt[1];
        }

        const width = maxX - minX;
        const height = maxY - minY;
        const area = width * height; // Approximate
        const numTrees = Math.min(Math.floor(area * density), MAX_TREES_PER_POLYGON);

        if (numTrees <= 0) continue;

        // Use pseudo-random scattering with point-in-polygon test
        let placed = 0;
        let attempts = 0;
        const maxAttempts = numTrees * 4; // Allow 4x attempts for rejection sampling

        while (placed < numTrees && attempts < maxAttempts) {
            attempts++;
            const px = minX + Math.random() * width;
            const py = minY + Math.random() * height;

            if (pointInPolygon(px, py, ring)) {
                // Add slight random scale variation
                const scale = 0.6 + Math.random() * 0.8; // 0.6 → 1.4
                const pos = new THREE.Vector3(px, 0, -py);
                pos.userData = { scale };
                positions.push(pos);
                placed++;
            }
        }
    }

    return positions;
}

// ─── Point-in-Polygon (ray casting) ─────────────────────────
function pointInPolygon(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

// ─── Instanced Tree Builder ─────────────────────────────────
function buildInstancedTrees(treeData) {
    const treeGroup = new THREE.Group();
    treeGroup.name = 'vegetation-trees';

    const count = treeData.length;
    const trunkGeo = getTrunkGeometry();
    const canopyGeo = getCanopyGeometry();

    const trunkMat = new THREE.MeshPhongMaterial({
        color: TRUNK_COLOR,
        flatShading: true,
        shininess: 5,
    });

    const canopyMat = new THREE.MeshPhongMaterial({
        color: CANOPY_COLORS.default,
        flatShading: true,
        shininess: 10,
    });

    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    trunkMesh.name = 'tree-trunks';

    const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, count);
    canopyMesh.castShadow = true;
    canopyMesh.receiveShadow = true;
    canopyMesh.name = 'tree-canopies';

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
        const { pos, vegType } = treeData[i];
        const scale = pos.userData?.scale ?? (0.6 + Math.random() * 0.8);
        const rotY = Math.random() * Math.PI * 2; // Random rotation for variety

        dummy.position.copy(pos);
        dummy.scale.set(scale, scale, scale);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();

        trunkMesh.setMatrixAt(i, dummy.matrix);
        canopyMesh.setMatrixAt(i, dummy.matrix);

        // Vary canopy color slightly per tree
        const baseColor = CANOPY_COLORS[vegType] ?? CANOPY_COLORS.default;
        color.setHex(baseColor);
        // Add slight random hue/lightness variation
        const hsl = {};
        color.getHSL(hsl);
        hsl.h += (Math.random() - 0.5) * 0.03;
        hsl.l += (Math.random() - 0.5) * 0.08;
        hsl.s = Math.min(1, Math.max(0, hsl.s + (Math.random() - 0.5) * 0.1));
        color.setHSL(hsl.h, hsl.s, hsl.l);
        canopyMesh.setColorAt(i, color);
    }

    trunkMesh.instanceMatrix.needsUpdate = true;
    canopyMesh.instanceMatrix.needsUpdate = true;
    if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;

    treeGroup.add(trunkMesh);
    treeGroup.add(canopyMesh);

    console.log(`[Vegetation] Created ${count} instanced trees (2 draw calls)`);

    return treeGroup;
}
