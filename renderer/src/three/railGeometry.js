/**
 * railGeometry.js — Renders railway networks.
 * Generates a dark gravel ballast bed with two raised metallic rails.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Standard track gauge is ~1.435m. We use slightly exaggerated widths for visual clarity from afar.
const GAUGE_OFFSET = 0.8;
const BALLAST_WIDTH = 3.5;
const RAIL_WIDTH = 0.3;

const BALLAST_COLOR = 0x3a3a40;
const RAIL_COLOR = 0xb0b5ba;

/**
 * Creates a Three.js group containing all railway geometries.
 */
export function createRailGroup(features) {
    const group = new THREE.Group();
    group.name = 'railways';

    const railways = features.filter(
        (f) => f.properties?.osm_type === 'railway' && f.geometry?.type === 'LineString'
    );
    console.log(`[Transit] Found ${railways.length} railway features in the payload`);
    if (railways.length === 0) return group;

    const ballastGeometries = [];
    const railGeometries = [];

    for (const rail of railways) {
        const { ballast, rails } = createTrackGeometry(rail);
        if (ballast && rails) {
            ballastGeometries.push(ballast);
            railGeometries.push(rails);
        }
    }

    if (ballastGeometries.length > 0) {
        const mergedBallast = mergeGeometries(ballastGeometries, false);
        const ballastMat = new THREE.MeshStandardMaterial({
            color: BALLAST_COLOR,
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        const ballastMesh = new THREE.Mesh(mergedBallast, ballastMat);
        ballastMesh.receiveShadow = true;
        group.add(ballastMesh);
        ballastGeometries.forEach(g => g.dispose());
    }

    if (railGeometries.length > 0) {
        const mergedRails = mergeGeometries(railGeometries, false);
        const railMat = new THREE.MeshStandardMaterial({
            color: RAIL_COLOR,
            roughness: 0.3,
            metalness: 0.8, // Make the steel track highly metallic
            side: THREE.DoubleSide
        });
        const railMesh = new THREE.Mesh(mergedRails, railMat);
        railMesh.receiveShadow = true;
        railMesh.castShadow = true;
        group.add(railMesh);
        railGeometries.forEach(g => g.dispose());
    }

    return group;
}

/**
 * Creates a tuple of { ballast, rails } geometries from a LineString centerline.
 */
function createTrackGeometry(feature) {
    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return { ballast: null, rails: null };

    const ballastHalfW = BALLAST_WIDTH / 2;
    const railHalfW = RAIL_WIDTH / 2;

    try {
        const ballastVerts = [];
        const ballastIndices = [];

        const railVerts = [];
        const railIndices = [];

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

            const nx = -dy / len;
            const ny = dx / len;

            // Determine base elevation based on tunnel/layer
            let baseElev = 0;
            if (feature.properties?.is_tunnel || (feature.properties?.layer && feature.properties.layer < 0)) {
                const layerLevel = feature.properties?.layer || -1;
                baseElev = layerLevel * 8 - 0.5; // push underground
            }

            // 1. Ballast Ribbon
            const bxOff = nx * ballastHalfW;
            const byOff = ny * ballastHalfW;

            const bIdx = ballastVerts.length / 3;
            ballastVerts.push(
                x + bxOff, baseElev + 0.2, -(y + byOff),
                x - bxOff, baseElev + 0.2, -(y - byOff)
            );

            if (bIdx >= 2) {
                ballastIndices.push(bIdx - 2, bIdx - 1, bIdx);
                ballastIndices.push(bIdx - 1, bIdx + 1, bIdx);
            }

            // 2. Dual Rails Ribbon
            const rxRight = nx * GAUGE_OFFSET;
            const ryRight = ny * GAUGE_OFFSET;

            const rxLeft = -nx * GAUGE_OFFSET;
            const ryLeft = -ny * GAUGE_OFFSET;

            // Right Rail Width Offsets
            const rrxOut = rxRight + (nx * railHalfW);
            const rryOut = ryRight + (ny * railHalfW);
            const rrxIn = rxRight - (nx * railHalfW);
            const rryIn = ryRight - (ny * railHalfW);

            // Left Rail Width Offsets
            const rlxOut = rxLeft - (nx * railHalfW); // 'out' is further left
            const rlyOut = ryLeft - (ny * railHalfW);
            const rlxIn = rxLeft + (nx * railHalfW); // 'in' is back towards center
            const rlyIn = ryLeft + (ny * railHalfW);

            const rIdx = railVerts.length / 3;

            // Push right rail (2 verts) then left rail (2 verts)
            railVerts.push(
                x + rrxOut, baseElev + 0.4, -(y + rryOut),
                x + rrxIn, baseElev + 0.4, -(y + rryIn),
                x + rlxIn, baseElev + 0.4, -(y + rlyIn),
                x + rlxOut, baseElev + 0.4, -(y + rlyOut)
            );

            if (rIdx >= 4) {
                // Right rail indices
                railIndices.push(
                    rIdx - 4, rIdx - 3, rIdx,
                    rIdx - 3, rIdx + 1, rIdx
                );
                // Left rail indices
                railIndices.push(
                    rIdx - 2, rIdx - 1, rIdx + 2,
                    rIdx - 1, rIdx + 3, rIdx + 2
                );
            }
        }

        if (ballastVerts.length < 6 || railVerts.length < 12) return { ballast: null, rails: null };

        const ballast = new THREE.BufferGeometry();
        ballast.setAttribute('position', new THREE.Float32BufferAttribute(ballastVerts, 3));
        ballast.setIndex(ballastIndices);
        ballast.computeVertexNormals();

        const rails = new THREE.BufferGeometry();
        rails.setAttribute('position', new THREE.Float32BufferAttribute(railVerts, 3));
        rails.setIndex(railIndices);
        rails.computeVertexNormals();

        return { ballast, rails };
    } catch (err) {
        console.warn(`Failed to generate track geometry for feature ${feature.properties?.osm_id}:`, err);
        return { ballast: null, rails: null };
    }
}
