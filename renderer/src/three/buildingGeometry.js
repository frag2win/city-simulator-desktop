/**
 * buildingGeometry.js — Extrudes GeoJSON polygon buildings into 3D meshes.
 * Each building becomes an ExtrudeGeometry with height from properties.
 */
import * as THREE from 'three';

// Color palette for buildings based on height
const BUILDING_COLORS = {
    low: new THREE.Color(0x4a5568),      // Gray — 1-3 floors
    medium: new THREE.Color(0x5a6577),   // Blue-gray — 4-8 floors
    tall: new THREE.Color(0x6b7a8d),     // Lighter — 9-15 floors
    high: new THREE.Color(0x7c8da0),     // Steel — 16+ floors
};

const BUILDING_EDGE_COLOR = new THREE.Color(0x2d3748);

/**
 * Create a Three.js group containing all building meshes from GeoJSON.
 */
export function createBuildingGroup(features) {
    const group = new THREE.Group();
    group.name = 'buildings';

    const buildings = features.filter(
        (f) => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    if (buildings.length === 0) return group;

    // Use instanced meshes for performance when many buildings are similar
    // But for varied heights, individual meshes are needed
    for (const feature of buildings) {
        const mesh = createBuildingMesh(feature);
        if (mesh) {
            group.add(mesh);
        }
    }

    return group;
}

/**
 * Create a single building mesh from a GeoJSON feature.
 */
function createBuildingMesh(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || !coords[0] || coords[0].length < 3) return null;

    const height = feature.properties?.height || 10.5;
    const levels = feature.properties?.building_levels || 3;

    try {
        // Create a 2D shape from the polygon ring
        const ring = coords[0]; // Outer ring only
        const shape = new THREE.Shape();

        // Move to first point
        shape.moveTo(ring[0][0], ring[0][1]);

        // Line to subsequent points
        for (let i = 1; i < ring.length; i++) {
            shape.lineTo(ring[i][0], ring[i][1]);
        }

        shape.closePath();

        // Extrude settings
        const extrudeSettings = {
            depth: height,
            bevelEnabled: false,
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Rotate so extrusion goes UP (Y axis) instead of Z
        geometry.rotateX(-Math.PI / 2);

        // Color based on height
        const color = getBuildingColor(levels);
        const material = new THREE.MeshPhongMaterial({
            color,
            flatShading: true,
            transparent: true,
            opacity: 0.92,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Store metadata for selection
        mesh.userData = {
            type: 'building',
            osm_id: feature.properties?.osm_id,
            name: feature.properties?.name,
            height,
            levels,
            tags: feature.properties?.tags || {},
        };

        // Add edges for visual clarity
        const edgesGeometry = new THREE.EdgesGeometry(geometry, 15);
        const edgesMaterial = new THREE.LineBasicMaterial({
            color: BUILDING_EDGE_COLOR,
            transparent: true,
            opacity: 0.3,
        });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        mesh.add(edges);

        return mesh;
    } catch (err) {
        // Skip malformed polygons silently
        return null;
    }
}

function getBuildingColor(levels) {
    if (levels <= 3) return BUILDING_COLORS.low;
    if (levels <= 8) return BUILDING_COLORS.medium;
    if (levels <= 15) return BUILDING_COLORS.tall;
    return BUILDING_COLORS.high;
}
