/**
 * zoneGeometry.js — Renders urban zoning areas (residential, commercial, industrial) 
 * as flat color-coded polygons at y=0.05.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const ZONE_COLORS = {
    residential: 0x96c896, // Soft Green
    commercial: 0x96b4dc,  // Soft Blue
    industrial: 0xb496b4,  // Soft Purple
    retail: 0x96b4dc,      // Soft Blue
    default: 0xdcdcdc,     // Light Grey
};

/**
 * Creates a Three.js group containing all zoning polygon meshes.
 */
export function createZoneGroup(features) {
    const group = new THREE.Group();
    group.name = 'zones';

    const zoneFeatures = features.filter(f => f.properties?.osm_type === 'landuse');
    console.log(`[Zoning] Found ${zoneFeatures.length} landuse features in the payload`);
    if (zoneFeatures.length === 0) return group;

    // Group geometries by landuse type so we can batch them under shared materials
    const geomGroups = {
        residential: [],
        commercial: [],
        industrial: [],
        retail: [],
        default: [],
    };

    // User data map to associate specific features via raycaster
    const raycasterMap = new Map();

    for (const feature of zoneFeatures) {
        if (feature.geometry?.type === 'Polygon' || feature.geometry?.type === 'MultiPolygon') {
            const polygonGeoms = createZonePolygonGeometries(feature);

            if (polygonGeoms.length > 0) {
                const type = feature.properties?.landuse || 'default';
                const bucket = geomGroups[type] ? type : 'default';
                geomGroups[bucket].push(...polygonGeoms);
            }
        }
    }

    // Material definitions
    const materials = {};
    for (const [type, hex] of Object.entries(ZONE_COLORS)) {
        materials[type] = new THREE.MeshStandardMaterial({
            color: hex,
            roughness: 0.9,
            metalness: 0.0,
            transparent: true,
            opacity: 0.45,
            side: THREE.BackSide, // Polygons are drawn in 2D, translating to Extrude mapping
            depthWrite: false, // Prevents Z-fighting heavily
        });
    }

    // Merge and assemble
    for (const [type, geometries] of Object.entries(geomGroups)) {
        if (geometries.length > 0) {
            const merged = mergeGeometries(geometries, false);
            if (merged) {
                const mesh = new THREE.Mesh(merged, materials[type]);
                mesh.receiveShadow = true;
                // Currently zoning patches are merged monolithic meshes to save draw calls.
                // We sacrifice individual clickability for performance on these background layers.
                group.add(mesh);

                // Dispose individual buffer memory
                geometries.forEach(g => g.dispose());
            }
        }
    }

    return group;
}

function createZonePolygonGeometries(feature) {
    const coordsList = feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates
        : [feature.geometry.coordinates];

    const generatedGeoms = [];

    for (const coords of coordsList) {
        if (!coords || !coords[0] || coords[0].length < 3) continue;

        const ring = coords[0];

        // Dedupe consecutive coincident points
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
            geom.rotateX(-Math.PI / 2); // Mapping shape Y to world -Z
            geom.translate(0, 0.05, 0); // Ground level + 0.05 (below roads, above ground)
            geom.computeVertexNormals();
            generatedGeoms.push(geom);
        } catch (err) {
            console.warn(`Failed to triangulate zoning polygon for feature ${feature.properties?.osm_id}:`, err);
        }
    }

    return generatedGeoms;
}
