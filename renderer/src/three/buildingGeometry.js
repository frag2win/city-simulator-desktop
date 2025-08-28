/**
 * buildingGeometry.js — Renders buildings with height-based colors and edge wireframes.
 * Uses BoxGeometry at polygon centroid for reliability, with visual polish.
 */
import * as THREE from 'three';

// Height-based color palette (HSL-tuned blue-gray tones)
function getBuildingColor(height) {
    if (height <= 8) return new THREE.Color().setHSL(0.6, 0.12, 0.42); // Low — dark slate
    if (height <= 20) return new THREE.Color().setHSL(0.58, 0.15, 0.48); // Medium — steel
    if (height <= 40) return new THREE.Color().setHSL(0.56, 0.18, 0.55); // Tall — lighter steel
    return new THREE.Color().setHSL(0.54, 0.22, 0.65); // High-rise — bright steel
}

const EDGE_COLOR = new THREE.Color(0x1a1a2e);

/**
 * Create a Three.js group containing all building meshes from GeoJSON.
 */
export function createBuildingGroup(features) {
    const group = new THREE.Group();
    group.name = 'buildings';

    const buildings = features.filter(
        (f) => f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon'
    );

    let created = 0;

    for (const feature of buildings) {
        const coords = feature.geometry.coordinates;
        if (!coords || !coords[0] || coords[0].length < 4) continue;

        const ring = coords[0];
        const height = feature.properties?.height || 10.5;
        const levels = feature.properties?.building_levels || 3;

        // Compute bounding box of polygon
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

        // Geometry
        const geom = new THREE.BoxGeometry(w, height, d);
        const color = getBuildingColor(height);
        const mat = new THREE.MeshPhongMaterial({
            color,
            flatShading: true,
            shininess: 30,
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(cx, height / 2, -cy);
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

    console.log(`[BuildingGeometry] Created ${created} buildings`);
    return group;
}
