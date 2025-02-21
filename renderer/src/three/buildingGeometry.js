/**
 * buildingGeometry.js — Extrudes GeoJSON polygon buildings into 3D meshes.
 * Uses a robust approach: attempts ExtrudeGeometry first, falls back to
 * bounding-box BoxGeometry if triangulation fails on complex polygons.
 */
import * as THREE from 'three';

// Color palette for buildings based on height
const BUILDING_COLORS = {
    low: 0x5a6a7a,      // Gray — 1-3 floors
    medium: 0x6a7a8a,   // Blue-gray — 4-8 floors
    tall: 0x7a8a9a,     // Lighter — 9-15 floors
    high: 0x8a9aaa,     // Steel — 16+ floors
};

/**
 * Create a Three.js group containing all building meshes from GeoJSON.
 */
export function createBuildingGroup(features) {
    const group = new THREE.Group();
    group.name = 'buildings';

    const buildings = features.filter(
        (f) => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    console.log(`[BuildingGeometry] Found ${buildings.length} building features`);

    let extrudeCount = 0;
    let boxFallbackCount = 0;
    let failCount = 0;

    for (const feature of buildings) {
        const mesh = createBuildingMesh(feature);
        if (mesh) {
            if (mesh.userData._fallback) {
                boxFallbackCount++;
            } else {
                extrudeCount++;
            }
            group.add(mesh);
        } else {
            failCount++;
        }
    }

    console.log(`[BuildingGeometry] Created ${extrudeCount} extruded, ${boxFallbackCount} box fallbacks, ${failCount} failed`);
    return group;
}

/**
 * Create a single building mesh from a GeoJSON feature.
 */
function createBuildingMesh(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || !coords[0] || coords[0].length < 4) return null;

    const height = feature.properties?.height || 10.5;
    const levels = feature.properties?.building_levels || 3;

    // Try extrude first, then fall back to box
    let mesh = tryExtrudeMesh(coords[0], height, levels);
    if (!mesh) {
        mesh = tryBoxFallback(coords[0], height, levels);
        if (mesh) mesh.userData._fallback = true;
    }

    if (mesh) {
        mesh.userData = {
            ...mesh.userData,
            type: 'building',
            osm_id: feature.properties?.osm_id,
            name: feature.properties?.name,
            height,
            levels,
        };
    }

    return mesh;
}

/**
 * Attempt to create an extruded mesh from polygon ring.
 */
function tryExtrudeMesh(ring, height, levels) {
    try {
        const shape = new THREE.Shape();

        // Ring coords are [x, y, 0] in projected meters
        shape.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) {
            shape.lineTo(ring[i][0], ring[i][1]);
        }

        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: height,
            bevelEnabled: false,
        });

        // Check if geometry is valid (has vertices)
        if (!geometry.attributes.position || geometry.attributes.position.count === 0) {
            geometry.dispose();
            return null;
        }

        // Rotate so extrusion goes UP (Y axis) instead of Z
        geometry.rotateX(-Math.PI / 2);

        const color = getBuildingColor(levels);
        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.7,
            metalness: 0.1,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    } catch {
        return null;
    }
}

/**
 * Fallback: create a simple box at the polygon's centroid.
 */
function tryBoxFallback(ring, height, levels) {
    try {
        // Compute centroid and approximate size
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }

        const w = Math.max(maxX - minX, 2);
        const d = Math.max(maxY - minY, 2);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const geom = new THREE.BoxGeometry(w, height, d);
        const color = getBuildingColor(levels);
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.7,
            metalness: 0.1,
        });

        const mesh = new THREE.Mesh(geom, mat);
        // Position: X = east-west, Y = up (half height), Z = negative north-south
        mesh.position.set(cx, height / 2, -cy);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    } catch {
        return null;
    }
}

function getBuildingColor(levels) {
    if (levels <= 3) return BUILDING_COLORS.low;
    if (levels <= 8) return BUILDING_COLORS.medium;
    if (levels <= 15) return BUILDING_COLORS.tall;
    return BUILDING_COLORS.high;
}
