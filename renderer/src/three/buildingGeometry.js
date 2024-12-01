/**
 * buildingGeometry.js — Renders buildings by extruding actual polygon footprints.
 * Uses THREE.ExtrudeGeometry for realistic building shapes instead of bounding-box cubes.
 * Falls back to BoxGeometry for degenerate polygons.
 */
import * as THREE from 'three';

// ---------- Height-based color palette (HSL blue-gray tones) ----------
const HEIGHT_BANDS = [
    { max: 8,  h: 0.60, s: 0.15, l: 0.55 }, // Low — slate
    { max: 20, h: 0.58, s: 0.18, l: 0.62 }, // Medium — steel
    { max: 40, h: 0.56, s: 0.22, l: 0.68 }, // Tall — lighter
    { max: Infinity, h: 0.54, s: 0.25, l: 0.75 }, // High-rise — bright
];

function getBuildingColor(height) {
    const band = HEIGHT_BANDS.find(b => height <= b.max);
    return new THREE.Color().setHSL(band.h, band.s, band.l);
}

const EDGE_COLOR = new THREE.Color(0x1a1a2e);
const EXTRUDE_BASE = { bevelEnabled: false, steps: 1 };

// ---------- Helpers ----------

/**
 * Convert a GeoJSON polygon ring → THREE.Shape.
 * Returns null if degenerate (< 3 unique pts or zero-area).
 */
function ringToShape(ring) {
    if (!ring || ring.length < 4) return null;

    // Dedupe consecutive coincident points
    const pts = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        const prev = pts[pts.length - 1];
        if (Math.abs(ring[i][0] - prev[0]) > 0.01 || Math.abs(ring[i][1] - prev[1]) > 0.01) {
            pts.push(ring[i]);
        }
    }
    if (pts.length < 3) return null;

    // Signed-area check — skip zero-area polygons
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    if (Math.abs(area) < 0.5) return null;

    // Build shape (X, Y) — rotateX(-PI/2) will map shape-Y → world -Z
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], pts[i][1]);
    }
    shape.closePath();
    return shape;
}

/**
 * Create a Three.js group containing all building meshes from GeoJSON features.
 * Buildings use real polygon footprint extrusion for accurate shapes.
 */
export function createBuildingGroup(features) {
    const group = new THREE.Group();
    group.name = 'buildings';

    const buildings = features.filter(
        (f) => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    if (buildings.length === 0) return group;

    let created = 0;

    for (const feature of buildings) {
        const coords = feature.geometry.coordinates;
        if (!coords || !coords[0] || coords[0].length < 4) continue;

        const ring = coords[0];
        const height = feature.properties?.height || 10.5;
        const levels = feature.properties?.building_levels || 3;

        // Try real polygon extrusion first
        const shape = ringToShape(ring);
        let geom;

        if (shape) {
            try {
                geom = new THREE.ExtrudeGeometry(shape, { ...EXTRUDE_BASE, depth: height });
                // ExtrudeGeometry extrudes along +Z; rotate so building grows upward (+Y)
                geom.rotateX(-Math.PI / 2);
            } catch {
                geom = null; // fallback below
            }
        }

        if (!geom) {
            // Fallback: bounding-box cube for degenerate polygons
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            for (const pt of ring) {
                if (pt[0] < minX) minX = pt[0];
                if (pt[0] > maxX) maxX = pt[0];
                if (pt[1] < minY) minY = pt[1];
                if (pt[1] > maxY) maxY = pt[1];
            }
            const w = Math.max(maxX - minX, 1);
            const d = Math.max(maxY - minY, 1);
            const cx = (minX + maxX) / 2;
            const cy = (minY + maxY) / 2;

            geom = new THREE.BoxGeometry(w, height, d);
            geom.translate(cx, height / 2, -cy);
        }

        const color = getBuildingColor(height);
        const mat = new THREE.MeshPhongMaterial({
            color,
            emissive: new THREE.Color(0x223344),
            emissiveIntensity: 0.4,
            flatShading: true,
            shininess: 30,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Edge wireframe for visual clarity
        const edgesGeom = new THREE.EdgesGeometry(geom);
        const edgesMat = new THREE.LineBasicMaterial({
            color: EDGE_COLOR,
            transparent: true,
            opacity: 0.25,
        });
        const edges = new THREE.LineSegments(edgesGeom, edgesMat);
        mesh.add(edges);

        mesh.userData = {
            type: 'building',
            osm_id: feature.properties?.osm_id,
            name: feature.properties?.name,
            height,
            levels,
        };

        group.add(mesh);
        created++;
    }

    return group;
}
