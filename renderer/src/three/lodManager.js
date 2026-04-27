/**
 * lodManager.js — Level-of-Detail manager for distant buildings.
 *
 * BUG FIXES:
 *  2a. containsPoint() → intersectsSphere() — a building's center can be
 *      outside the frustum while the mesh is still partially visible.
 *      intersectsSphere() against the bounding sphere is the correct test.
 *  2b. Distance-delta skip NO LONGER controls visibility — only controls
 *      whether we recompute the LOD tier (castShadow, height threshold).
 *      Visibility is always set for every in-frustum object.
 *  2c. register() forces updateMatrixWorld(true) so matrixAutoUpdate=false
 *      meshes have correct world matrices for distance / frustum math.
 *
 * Perf notes (from 0e):
 *  - Frustum built once per tick, not per building
 *  - _lastDist map skips tier-switching math when camera moves < 5 units
 *  - 4-tier distance thresholds tuned for dense urban scenes
 */
import * as THREE from 'three';

const LOD_NEAR  =  400;   // Full detail + shadows
const LOD_MID   =  900;   // No shadows
const LOD_FAR   = 2000;   // Only buildings >= 8m
const LOD_ULTRA = 5000;   // Only buildings >= 25m

const MIN_HEIGHT_FAR   =  8;
const MIN_HEIGHT_ULTRA = 25;

// Pre-allocated scratch objects — never new() inside update()
const _cameraPos        = new THREE.Vector3();
const _objPos           = new THREE.Vector3();
const _frustum          = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();
const _sphere           = new THREE.Sphere(); // FIX 2a: for intersectsSphere

export class LODManager {
    constructor() {
        this.buildings      = [];   // [{ mesh, height, boundingSphere }]
        this.enabled        = true;
        this.lastUpdate     = 0;
        this.updateInterval = 0.5;  // seconds between full LOD ticks
        this._lastDist      = new Map(); // entry → last computed distance
    }

    /**
     * Register building group. Forces a world-matrix update so that
     * matrixAutoUpdate=false meshes have correct matrixWorld for distance math.
     * FIX 2c: buildingGroup.updateMatrixWorld(true) called here.
     */
    register(buildingGroup) {
        this.buildings = [];
        this._lastDist.clear();
        if (!buildingGroup) return;

        // FIX 2c: force world matrix update before registering — meshes have
        // matrixAutoUpdate=false so their matrixWorld must be manually refreshed
        buildingGroup.updateMatrixWorld(true);

        buildingGroup.traverse((obj) => {
            if (!obj.isMesh && !obj.isBatchedMesh) return;

            if (obj.name === 'buildings-solid') {
                // BUG 3 FIX: merged mesh — the whole city is ONE object.
                // Three.js frustum-culls it when its bounding sphere centre
                // leaves the frustum (happens on close zoom). Disabling
                // frustumCulled lets Three.js always draw it; the GPU clip
                // unit discards off-screen fragments for free anyway.
                obj.frustumCulled = false;
                // Do NOT add to this.buildings — LOD manager has no
                // per-building height data for the merged mesh.
                return;
            }

            if (obj.isMesh && obj.userData?.type === 'building') {
                // Legacy individual meshes (pre-optimization path)
                if (obj.geometry && !obj.geometry.boundingSphere) {
                    obj.geometry.computeBoundingSphere();
                }
                this.buildings.push({
                    mesh: obj,
                    height: obj.userData.height || 10,
                    boundingSphere: obj.geometry?.boundingSphere ?? null,
                });
            }
        });

        console.log(`[LODManager] Registered ${this.buildings.length} LOD entries`);
    }

    /**
     * Update LOD — called every frame, throttled to updateInterval.
     * FIX 2a: sphere-based frustum test instead of containsPoint.
     * FIX 2b: visibility is ALWAYS reset for in-frustum objects;
     *         only the LOD tier (castShadow / height filter) uses the
     *         distance-delta skip optimisation.
     */
    update(camera, dt) {
        if (!this.enabled || this.buildings.length === 0) return;

        this.lastUpdate += dt;
        if (this.lastUpdate < this.updateInterval) return;
        this.lastUpdate = 0;

        // Build frustum once per tick
        _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        _frustum.setFromProjectionMatrix(_projScreenMatrix);
        camera.getWorldPosition(_cameraPos);

        for (const b of this.buildings) {
            b.mesh.getWorldPosition(_objPos);

            // ── FIX 2a: intersectsSphere instead of containsPoint ────────────
            // A building's centroid can be off-screen while part of the mesh
            // is still visible (large merged mesh, or building on frustum edge).
            if (b.boundingSphere) {
                _sphere.copy(b.boundingSphere);
                _sphere.applyMatrix4(b.mesh.matrixWorld);
                if (!_frustum.intersectsSphere(_sphere)) {
                    b.mesh.visible = false;
                    continue;
                }
            } else {
                // No bounding sphere (e.g. empty group) — fall back to point test
                if (!_frustum.containsPoint(_objPos)) {
                    b.mesh.visible = false;
                    continue;
                }
            }

            // Object is in frustum — always make it visible first
            // FIX 2b: visibility reset is unconditional, NOT gated by distance delta
            b.mesh.visible = true;

            const dist = _cameraPos.distanceTo(_objPos);

            // ── FIX 2b: distance-delta skip only controls TIER changes ───────
            // (castShadow + height visibility filter) — never controls .visible
            const lastDist = this._lastDist.get(b) ?? -999;
            if (Math.abs(dist - lastDist) < 5) continue; // skip tier recalc only
            this._lastDist.set(b, dist);

            // Apply 4-tier LOD (shadow + height filter only — visibility already set above)
            if (dist < LOD_NEAR) {
                b.mesh.castShadow = true;
            } else if (dist < LOD_MID) {
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
