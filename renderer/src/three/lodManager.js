/**
 * lodManager.js — Level-of-Detail manager for distant buildings.
 * Reduces geometry detail for buildings far from the camera to maintain ≥45fps.
 *
 * Strategy:
 *  - Near (<200m): Full BoxGeometry + edge wireframe (as built)
 *  - Mid (200-600m): BoxGeometry only, no wireframe edges
 *  - Far (>600m): Hide very small buildings (height < 6m), disable shadows
 *
 * Called each frame from the render loop.
 */
import * as THREE from 'three';

const LOD_NEAR = 200;
const LOD_MID = 600;
const LOD_FAR = 1200;
const MIN_HEIGHT_FAR = 6; // buildings shorter than this are hidden at far distances

const _cameraPos = new THREE.Vector3();
const _objPos = new THREE.Vector3();

export class LODManager {
    constructor() {
        this.buildings = [];   // { mesh, height, hasEdges }
        this.enabled = true;
        this.lastUpdate = 0;
        this.updateInterval = 0.5; // seconds between LOD recalculations
    }

    /**
     * Register a building group for LOD management.
     * @param {THREE.Group} buildingGroup — the 'buildings' group from CityScene
     */
    register(buildingGroup) {
        this.buildings = [];
        if (!buildingGroup) return;

        buildingGroup.traverse((obj) => {
            if (obj.isMesh && obj.userData?.type === 'building') {
                const hasEdges = obj.children.some(c => c.isLineSegments);
                this.buildings.push({
                    mesh: obj,
                    height: obj.userData.height || 10,
                    hasEdges,
                    _edgesVisible: true,
                    _shadowState: true,
                });
            }
        });
    }

    /**
     * Update LOD levels based on camera distance.
     * Called from the render loop — throttled to updateInterval.
     * @param {THREE.Camera} camera
     * @param {number} dt — delta time in seconds
     */
    update(camera, dt) {
        if (!this.enabled || this.buildings.length === 0) return;

        this.lastUpdate += dt;
        if (this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = 0;

        camera.getWorldPosition(_cameraPos);

        for (const b of this.buildings) {
            b.mesh.getWorldPosition(_objPos);
            const dist = _cameraPos.distanceTo(_objPos);

            if (dist < LOD_NEAR) {
                // Near: full detail
                b.mesh.visible = true;
                if (b.hasEdges && !b._edgesVisible) {
                    b.mesh.children.forEach(c => { if (c.isLineSegments) c.visible = true; });
                    b._edgesVisible = true;
                }
                if (!b._shadowState) {
                    b.mesh.castShadow = true;
                    b._shadowState = true;
                }
            } else if (dist < LOD_MID) {
                // Mid: no edges
                b.mesh.visible = true;
                if (b.hasEdges && b._edgesVisible) {
                    b.mesh.children.forEach(c => { if (c.isLineSegments) c.visible = false; });
                    b._edgesVisible = false;
                }
                if (!b._shadowState) {
                    b.mesh.castShadow = true;
                    b._shadowState = true;
                }
            } else if (dist < LOD_FAR) {
                // Far: no edges, no shadows
                b.mesh.visible = true;
                if (b.hasEdges && b._edgesVisible) {
                    b.mesh.children.forEach(c => { if (c.isLineSegments) c.visible = false; });
                    b._edgesVisible = false;
                }
                if (b._shadowState) {
                    b.mesh.castShadow = false;
                    b._shadowState = false;
                }
            } else {
                // Very far: hide small buildings
                b.mesh.visible = b.height >= MIN_HEIGHT_FAR;
                if (b._shadowState) {
                    b.mesh.castShadow = false;
                    b._shadowState = false;
                }
            }
        }
    }

    dispose() {
        this.buildings = [];
    }
}
