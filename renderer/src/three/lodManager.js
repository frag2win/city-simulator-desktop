/**
 * lodManager.js — Level-of-Detail manager for distant buildings.
 *
 * FIX 0e improvements:
 *  1. Frustum culling — objects behind camera are hidden immediately, skipping LOD math
 *  2. Distance-delta skip — skip buildings whose distance changed < 5 units since last tick
 *  3. Extended 4-tier distances tuned for dense urban scenes (Mumbai/London density)
 *
 * Called each frame from the render loop (throttled internally to 0.5s interval).
 */
import * as THREE from 'three';

const LOD_NEAR  =  400;   // Full detail + shadows
const LOD_MID   =  900;   // No shadows
const LOD_FAR   = 2000;   // Only buildings >= 8m
const LOD_ULTRA = 5000;   // Only buildings >= 25m (skyscrapers only)

const MIN_HEIGHT_FAR   =  8;
const MIN_HEIGHT_ULTRA = 25;

// Pre-allocated — never allocate inside update()
const _cameraPos        = new THREE.Vector3();
const _objPos           = new THREE.Vector3();
const _frustum          = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();

export class LODManager {
    constructor() {
        this.buildings    = [];   // [{ mesh, height }]
        this.enabled      = true;
        this.lastUpdate   = 0;
        this.updateInterval = 0.5; // seconds between full LOD recalculations
        this._lastDist    = new Map(); // mesh → last computed distance
    }

    /**
     * Register a building group for LOD management.
     * Accepts both BatchedMesh (worker path) and legacy individual meshes.
     * @param {THREE.Group} buildingGroup — the 'buildings' group from CityScene
     */
    register(buildingGroup) {
        this.buildings = [];
        this._lastDist.clear();
        if (!buildingGroup) return;

        buildingGroup.traverse((obj) => {
            if ((obj.isMesh || obj.isBatchedMesh) && obj.name === 'buildings-solid') {
                // Worker path: one merged mesh — treat as single LOD entry
                this.buildings.push({ mesh: obj, height: 999 /* always show */ });
            } else if (obj.isMesh && obj.userData?.type === 'building') {
                // Legacy individual building mesh
                this.buildings.push({
                    mesh: obj,
                    height: obj.userData.height || 10,
                });
            }
        });

        console.log(`[LODManager] Registered ${this.buildings.length} LOD entries`);
    }

    /**
     * Update LOD levels based on camera distance.
     * Throttled to updateInterval seconds. Frustum-culls before any distance math.
     * @param {THREE.Camera} camera
     * @param {number} dt — delta time in seconds
     */
    update(camera, dt) {
        if (!this.enabled || this.buildings.length === 0) return;

        this.lastUpdate += dt;
        if (this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = 0;

        // Build frustum ONCE per LOD tick (not per building)
        _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_projScreenMatrix);

        camera.getWorldPosition(_cameraPos);

        for (const b of this.buildings) {
            b.mesh.getWorldPosition(_objPos);

            // Frustum cull: hide objects outside camera view entirely
            if (!_frustum.containsPoint(_objPos)) {
                b.mesh.visible = false;
                continue;
            }

            const dist = _cameraPos.distanceTo(_objPos);

            // Skip recalculation if camera barely moved relative to this building
            const lastDist = this._lastDist.get(b) ?? -999;
            if (Math.abs(dist - lastDist) < 5) continue;
            this._lastDist.set(b, dist);

            // Apply 4-tier LOD
            if (dist < LOD_NEAR) {
                b.mesh.visible    = true;
                b.mesh.castShadow = true;
            } else if (dist < LOD_MID) {
                b.mesh.visible    = true;
                b.mesh.castShadow = false;
            } else if (dist < LOD_FAR) {
                b.mesh.visible    = b.height >= MIN_HEIGHT_FAR;
                b.mesh.castShadow = false;
            } else if (dist < LOD_ULTRA) {
                b.mesh.visible    = b.height >= MIN_HEIGHT_ULTRA;
                b.mesh.castShadow = false;
            } else {
                b.mesh.visible    = false;
                b.mesh.castShadow = false;
            }
        }
    }

    dispose() {
        this.buildings = [];
        this._lastDist.clear();
    }
}
