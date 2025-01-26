/**
 * roadGeometry.js — Renders GeoJSON LineString roads as flat ribbons.
 * Uses simple BufferGeometry strips for reliability.
 */
import * as THREE from 'three';

// Road colors by type
const ROAD_COLORS = {
    motorway: 0xe88d5a,
    trunk: 0xd4885a,
    primary: 0xc9a652,
    secondary: 0x8b9fad,
    tertiary: 0x7a8c9a,
    residential: 0x5c6b77,
    service: 0x4a5660,
    footway: 0x6b8070,
    cycleway: 0x5a8a6a,
    path: 0x5a6a5a,
    default: 0x5c6b77,
};

// Road widths in meters
const ROAD_WIDTHS = {
    motorway: 7.0,
    trunk: 6.0,
    primary: 5.0,
    secondary: 4.0,
    tertiary: 3.5,
    residential: 3.0,
    service: 2.0,
    footway: 1.0,
    cycleway: 1.2,
    path: 0.8,
    default: 2.5,
};

/**
 * Create a Three.js group containing all road geometries.
 */
export function createRoadGroup(features) {
    const group = new THREE.Group();
    group.name = 'roads';

    const roads = features.filter(
        (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
    );

    for (const road of roads) {
        const mesh = createRoadStrip(road);
        if (mesh) {
            group.add(mesh);
        }
    }
    return group;
}

/**
 * Create a flat ribbon mesh for a single road using a simple strip.
 * This avoids CatmullRomCurve3 which can fail on short or collinear segments.
 */
function createRoadStrip(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return null;

    const type = feature.properties?.highway_type || 'default';
    const color = ROAD_COLORS[type] || ROAD_COLORS.default;
    const halfWidth = (ROAD_WIDTHS[type] || ROAD_WIDTHS.default) / 2;

    try {
        // Build a triangle strip for the road ribbon
        const vertices = [];
        const indices = [];

        for (let i = 0; i < coords.length; i++) {
            const [x, y] = coords[i]; // projected [x_meters, y_meters, 0]

            // Compute perpendicular direction for width
            let dx, dy;
            if (i < coords.length - 1) {
                dx = coords[i + 1][0] - x;
                dy = coords[i + 1][1] - y;
            } else {
                dx = x - coords[i - 1][0];
                dy = y - coords[i - 1][1];
            }

            const len = Math.sqrt(dx * dx + dy * dy);
            if (len === 0) continue;

            // Perpendicular (rotate 90°)
            const nx = -dy / len * halfWidth;
            const ny = dx / len * halfWidth;

            // Left and right edge points
            // Map: X = x, Y = 0.2 (road surface), Z = -y
            const idx = vertices.length / 3;
            vertices.push(x + nx, 0.5, -(y + ny));  // left
            vertices.push(x - nx, 0.5, -(y - ny));  // right

            if (idx >= 2) {
                indices.push(idx - 2, idx - 1, idx);
                indices.push(idx - 1, idx + 1, idx);
            }
        }

        if (vertices.length < 12) return null; // Need at least 2 segments

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({
            color,
            emissive: new THREE.Color(0x1a1a2e),
            emissiveIntensity: 0.35,
            roughness: 0.9,
            metalness: 0.0,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;

        mesh.userData = {
            type: 'road',
            osm_id: feature.properties?.osm_id,
            name: feature.properties?.name,
            highway_type: type,
        };

        return mesh;
    } catch {
        return null;
    }
}
