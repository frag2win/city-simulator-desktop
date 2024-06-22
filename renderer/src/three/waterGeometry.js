/**
 * waterGeometry.js — Renders water bodies (lakes, reservoirs, coastlines) as flat polygons,
 * and river/stream networks as flat ribbons at y=0.1.
 */
import * as THREE from 'three';

const WATER_COLOR = 0x204060;

const WATER_WIDTHS = {
    river: 40.0,
    stream: 8.0,
    canal: 15.0,
    drain: 4.0,
    ditch: 2.0,
    default: 15.0,
};

/**
 * Creates a Three.js group containing all water meshes (polygons and ribbons).
 */
export function createWaterGroup(features) {
    const group = new THREE.Group();
    group.name = 'water';

    const waterFeatures = features.filter(f => f.properties?.osm_type === 'water');
    console.log(`[Hydrology] Found ${waterFeatures.length} water features in the payload`, waterFeatures);
    if (waterFeatures.length === 0) return group;

    const material = createWaterMaterial();

    for (const feature of waterFeatures) {
        let geom = null;
        if (feature.geometry?.type === 'Polygon') {
            geom = createWaterPolygonGeometry(feature);
        } else if (feature.geometry?.type === 'LineString') {
            geom = createWaterRibbonGeometry(feature);
        }

        if (geom) {
            const mesh = new THREE.Mesh(geom, material);
            mesh.receiveShadow = true;
            mesh.userData = {
                type: 'water',
                osm_id: feature.properties?.osm_id,
                osm_element_type: feature.properties?.osm_element_type,
                name: feature.properties?.name,
                display_name: feature.properties?.display_name || 'Water Body',
                water_type: feature.properties?.water_type,
            };
            group.add(mesh);
        }
    }

    return group;
}

function createWaterMaterial() {
    return new THREE.MeshStandardMaterial({
        color: WATER_COLOR,
        roughness: 0.1,
        metalness: 0.1,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
    });
}

function createWaterPolygonGeometry(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || !coords[0] || coords[0].length < 3) return null;

    const ring = coords[0];

    // Dedupe consecutive coincident points
    const pts = [ring[0]];
    for (let i = 1; i < ring.length; i++) {
        const prev = pts[pts.length - 1];
        if (Math.abs(ring[i][0] - prev[0]) > 0.01 || Math.abs(ring[i][1] - prev[1]) > 0.01) {
            pts.push(ring[i]);
        }
    }
    if (pts.length < 3) return null;

    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
        shape.lineTo(pts[i][0], pts[i][1]);
    }

    const geom = new THREE.ShapeGeometry(shape);
    geom.rotateX(-Math.PI / 2); // Mapping shape Y to world -Z
    geom.translate(0, 0.1, 0); // Ground level + small offset to prevent z-fight with base
    geom.computeVertexNormals();
    return geom;
}

function createWaterRibbonGeometry(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return null;

    const type = feature.properties?.water_type || 'default';
    let width = WATER_WIDTHS[type] || WATER_WIDTHS.default;

    // Honor the explicit width tag from OSM if available
    if (feature.properties?.width) {
        width = feature.properties.width;
    }
    const halfWidth = width / 2;

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
            // Place water surface ribbons slightly above base terrain (0.1) but below roads (0.5).
            vertices.push(x + nx, 0.1, -(y + ny));
            vertices.push(x - nx, 0.1, -(y - ny));

            if (idx >= 2) {
                indices.push(idx - 2, idx - 1, idx);
                indices.push(idx - 1, idx + 1, idx);
            }
        }

        if (vertices.length < 6) return null;

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        return geometry;
    } catch {
        return null;
    }
}
