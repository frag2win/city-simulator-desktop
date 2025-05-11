/**
 * amenityGeometry.js — Renders GeoJSON point amenities as 3D markers.
 * Amenities appear as small glowing pillars on the ground.
 */
import * as THREE from 'three';

// Amenity colors by type
const AMENITY_COLORS = {
    hospital: new THREE.Color(0xef4444),
    school: new THREE.Color(0xf59e0b),
    university: new THREE.Color(0xf59e0b),
    restaurant: new THREE.Color(0x22c55e),
    cafe: new THREE.Color(0x8b5cf6),
    bank: new THREE.Color(0x3b82f6),
    fuel: new THREE.Color(0xf97316),
    pharmacy: new THREE.Color(0x10b981),
    police: new THREE.Color(0x6366f1),
    place_of_worship: new THREE.Color(0xd946ef),
    parking: new THREE.Color(0x64748b),
    default: new THREE.Color(0x818cf8),
};

/**
 * Create a Three.js group containing all amenity markers.
 */
export function createAmenityGroup(features) {
    const group = new THREE.Group();
    group.name = 'amenities';

    const amenities = features.filter(
        (f) => f.properties?.osm_type === 'amenity' && f.geometry?.type === 'Point'
    );

    if (amenities.length === 0) return group;

    // Create instanced mesh for performance (all same geometry)
    const markerGeometry = new THREE.CylinderGeometry(1.5, 2, 6, 6);
    const dummy = new THREE.Object3D();

    // Group by color for instanced rendering
    const byColor = {};
    for (const amenity of amenities) {
        const type = amenity.properties?.amenity || 'default';
        const color = AMENITY_COLORS[type] || AMENITY_COLORS.default;
        const key = color.getHexString();
        if (!byColor[key]) byColor[key] = { color, items: [] };
        byColor[key].items.push(amenity);
    }

    for (const { color, items } of Object.values(byColor)) {
        const material = new THREE.MeshPhongMaterial({
            color,
            emissive: color.clone().multiplyScalar(0.3),
            transparent: true,
            opacity: 0.9,
        });

        const instancedMesh = new THREE.InstancedMesh(
            markerGeometry,
            material,
            items.length
        );

        for (let i = 0; i < items.length; i++) {
            const coords = items[i].geometry.coordinates;
            dummy.position.set(coords[0], 3, -coords[1]); // Y=3 for half-height
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }

        instancedMesh.instanceMatrix.needsUpdate = true;
        instancedMesh.receiveShadow = true;
        group.add(instancedMesh);
    }

    return group;
}
