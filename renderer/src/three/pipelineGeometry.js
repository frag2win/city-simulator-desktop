import * as THREE from 'three';

const PIPELINE_COLORS = {
    gas: 0xcca300,
    water: 0x4a90e2,
    sewage: 0x8b7355,
    oil: 0x333333,
    unknown: 0x777777,
};

export function createPipelineGroup(features) {
    const group = new THREE.Group();
    group.name = 'pipelines';

    const pipelines = features.filter(
        (f) => f.properties?.osm_type === 'pipeline' && f.geometry?.type === 'LineString'
    );
    if (pipelines.length === 0) return group;

    const materials = {};
    for (const [type, hex] of Object.entries(PIPELINE_COLORS)) {
        materials[type] = new THREE.MeshStandardMaterial({
            color: hex,
            roughness: 0.6,
            metalness: 0.8,
            emissive: hex,
            emissiveIntensity: 0.5,
        });
    }

    const radius = 0.5;
    const radialSegments = 5;

    for (const pipe of pipelines) {
        const coords = pipe.geometry.coordinates;
        if (!coords || coords.length < 2) continue;

        const points = [];
        const layerLevel = pipe.properties?.layer || -1;
        const elevation = layerLevel * 8; // -8m per layer underground

        for (const [x, y] of coords) {
            points.push(new THREE.Vector3(x, elevation, -y));
        }

        try {
            const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.1);
            const tubularSegments = Math.max(2, Math.floor(curve.getLength() / 2));
            const geom = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
            
            const substance = pipe.properties?.substance || 'unknown';
            const mat = materials[substance] || materials.unknown;
            
            const mesh = new THREE.Mesh(geom, mat);
            group.add(mesh);
        } catch (e) {
            console.warn('Failed to build pipeline geometry', e);
        }
    }

    return group;
}
