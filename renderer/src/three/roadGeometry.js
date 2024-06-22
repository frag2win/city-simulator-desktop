/**
 * roadGeometry.js — Renders GeoJSON LineString roads as flat ribbons.
 * Each road is a separate mesh so per-road metadata (name, OSM ID) is preserved.
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
 * Batches roads by type into merged meshes for fewer draw calls.
 */
export function createRoadGroup(features) {
    const group = new THREE.Group();
    group.name = 'roads';

    const roads = features.filter(
        (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
    );

    // Bucket geometries by road type for merge
    const buckets = {}; // type → { geometries: [], userData: [] }

    for (const road of roads) {
        const type = road.properties?.highway_type || 'default';
        const geom = createRoadStripGeometry(road);
        if (!geom) continue;

        if (!buckets[type]) buckets[type] = [];
        buckets[type].push({
            geom, userData: {
                type: 'road',
                osm_id: road.properties?.osm_id,
                osm_element_type: road.properties?.osm_element_type,
                name: road.properties?.name,
                display_name: road.properties?.display_name || road.properties?.name,
                highway_type: type,
                surface: road.properties?.surface,
                lanes: road.properties?.lanes,
            }
        });
    }

    // Render each road as its own mesh so we keep per-road metadata
    // (name, OSM ID, display_name) for the entity info panel.
    for (const [type, items] of Object.entries(buckets)) {
        const color = ROAD_COLORS[type] || ROAD_COLORS.default;

        for (const item of items) {
            const mat = createRoadMaterial(color);
            const mesh = new THREE.Mesh(item.geom, mat);
            mesh.receiveShadow = true;
            mesh.userData = item.userData;
            group.add(mesh);
        }
    }

    return group;
}

function createRoadMaterial(color) {
    return new THREE.MeshStandardMaterial({
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
}

/**
 * Create a BufferGeometry ribbon strip for a single road.
 * Returns null on failure.
 */
function createRoadStripGeometry(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return null;

    const type = feature.properties?.highway_type || 'default';
    const halfWidth = (ROAD_WIDTHS[type] || ROAD_WIDTHS.default) / 2;

    try {
        const vertices = [];
        const indices = [];

        for (let i = 0; i < coords.length; i++) {
            const [x, y] = coords[i];

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

            const nx = -dy / len * halfWidth;
            const ny = dx / len * halfWidth;

            const idx = vertices.length / 3;
            vertices.push(x + nx, 0.5, -(y + ny));
            vertices.push(x - nx, 0.5, -(y - ny));

            if (idx >= 2) {
                indices.push(idx - 2, idx - 1, idx);
                indices.push(idx - 1, idx + 1, idx);
            }
        }

        if (vertices.length < 12) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    } catch {
        return null;
    }
}
