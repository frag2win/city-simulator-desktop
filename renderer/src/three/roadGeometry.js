/**
 * roadGeometry.js — Renders GeoJSON LineString roads as flat ribbons.
 * Roads are drawn as thin extruded strips lying on the ground plane.
 */
import * as THREE from 'three';

// Road colors by type
const ROAD_COLORS = {
    motorway: new THREE.Color(0xe88d5a),    // Orange
    trunk: new THREE.Color(0xd4885a),       // Amber
    primary: new THREE.Color(0xc9a652),     // Gold
    secondary: new THREE.Color(0x8b9fad),   // Steel blue
    tertiary: new THREE.Color(0x7a8c9a),    // Muted blue
    residential: new THREE.Color(0x5c6b77), // Dark gray-blue
    service: new THREE.Color(0x4a5660),     // Darker
    footway: new THREE.Color(0x6b8070),     // Green-gray
    cycleway: new THREE.Color(0x5a8a6a),    // Green
    path: new THREE.Color(0x5a6a5a),        // Dim green
    default: new THREE.Color(0x5c6b77),     // Fallback
};

// Road widths in scene units (meters from Cartesian projection)
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

    if (roads.length === 0) return group;

    // Group roads by type for batched rendering
    const roadsByType = {};
    for (const road of roads) {
        const type = road.properties?.highway_type || 'default';
        if (!roadsByType[type]) roadsByType[type] = [];
        roadsByType[type].push(road);
    }

    // Create one merged geometry per road type for performance
    for (const [type, typeRoads] of Object.entries(roadsByType)) {
        const color = ROAD_COLORS[type] || ROAD_COLORS.default;
        const width = ROAD_WIDTHS[type] || ROAD_WIDTHS.default;

        for (const road of typeRoads) {
            const mesh = createRoadMesh(road, color, width);
            if (mesh) {
                group.add(mesh);
            }
        }
    }

    return group;
}

/**
 * Create a flat ribbon mesh for a single road.
 */
function createRoadMesh(feature, color, width) {
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return null;

    try {
        // Create road as a flat ribbon using a tube-like approach
        const points = coords.map((c) => new THREE.Vector3(c[0], 0.15, -c[1])); // Slight Y offset above ground

        if (points.length < 2) return null;

        // Create path from points
        const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);

        // Create tube geometry (flat ribbon)
        const segments = Math.max(points.length * 2, 4);
        const geometry = new THREE.TubeGeometry(curve, segments, width / 2, 4, false);

        const material = new THREE.MeshPhongMaterial({
            color,
            flatShading: false,
            transparent: true,
            opacity: 0.85,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.receiveShadow = true;

        mesh.userData = {
            type: 'road',
            osm_id: feature.properties?.osm_id,
            name: feature.properties?.name,
            highway_type: feature.properties?.highway_type,
            tags: feature.properties?.tags || {},
        };

        return mesh;
    } catch {
        return null;
    }
}
