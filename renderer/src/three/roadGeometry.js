/**
 * roadGeometry.js — Renders GeoJSON LineString roads as flat merged ribbons.
 * FIX 0a: ONE merged Mesh per road type → ~10 draw calls instead of 12,928.
 * FIX 0f: MeshLambertMaterial replaces MeshStandardMaterial (no PBR needed for flat roads).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Road colors by type
const ROAD_COLORS = {
    motorway:    0xe88d5a,
    trunk:       0xd4885a,
    primary:     0xc9a652,
    secondary:   0x8b9fad,
    tertiary:    0x7a8c9a,
    residential: 0x5c6b77,
    service:     0x4a5660,
    footway:     0x6b8070,
    cycleway:    0x5a8a6a,
    path:        0x5a6a5a,
    default:     0x5c6b77,
};

// Road widths in meters
const ROAD_WIDTHS = {
    motorway:    7.0,
    trunk:       6.0,
    primary:     5.0,
    secondary:   4.0,
    tertiary:    3.5,
    residential: 3.0,
    service:     2.0,
    footway:     1.0,
    cycleway:    1.2,
    path:        0.8,
    default:     2.5,
};

/**
 * Create a Three.js group containing all road geometries.
 * Merges ALL roads of the same type into ONE Mesh — ~10 draw calls total.
 */
export function createRoadGroup(features) {
    const group = new THREE.Group();
    group.name = 'roads';

    const roads = features.filter(
        (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
    );

    if (roads.length === 0) return group;

    // Bucket raw geometries by road type
    const buckets = {}; // type → BufferGeometry[]

    for (const road of roads) {
        const type = road.properties?.highway_type || 'default';
        const geom = createRoadStripGeometry(road);
        if (!geom) continue;
        if (!buckets[type]) buckets[type] = [];
        buckets[type].push(geom);
    }

    // ONE merged Mesh per road type — replaces per-road Mesh loop
    for (const [type, geoms] of Object.entries(buckets)) {
        if (geoms.length === 0) continue;

        let merged;
        try {
            merged = mergeGeometries(geoms, false);
            geoms.forEach(g => g.dispose()); // free intermediate RAM
        } catch (err) {
            console.warn(`[roads] Failed to merge type "${type}":`, err);
            geoms.forEach(g => g.dispose());
            continue;
        }
        if (!merged) continue;

        const color = ROAD_COLORS[type] || ROAD_COLORS.default;
        // MeshLambertMaterial: flat/matte roads need no PBR — ~40% cheaper per fragment
        const mat = new THREE.MeshLambertMaterial({
            color,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -1,
        });

        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false; // static — never moves
        mesh.updateMatrix();
        mesh.userData = { type: 'road', highway_type: type };
        group.add(mesh);
    }

    console.log(`[roads] Rendered ${roads.length} roads in ${group.children.length} draw calls`);
    return group;
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
            const ny =  dx / len * halfWidth;

            const idx = vertices.length / 3;

            // Adjust elevation based on layer/tunnel status
            let elevation = 0.5;
            if (feature.properties?.is_tunnel || (feature.properties?.layer && feature.properties.layer < 0)) {
                const layerLevel = feature.properties?.layer || -1;
                elevation = layerLevel * 8;
            }

            vertices.push(x + nx, elevation, -(y + ny));
            vertices.push(x - nx, elevation, -(y - ny));

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
