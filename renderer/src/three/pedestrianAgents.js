/**
 * pedestrianAgents.js — Pedestrians walking between amenity/building waypoints.
 * Uses InstancedMesh (small capsules) for GPU performance.
 * Pedestrians walk towards nearest waypoints using weighted random selection,
 * preferring closer destinations for realistic cluster behavior.
 */
import * as THREE from 'three';

const MAX_PEDESTRIANS = 300;

const PED_COLORS = [
    new THREE.Color(0xddbb88), // tan
    new THREE.Color(0xcc9977), // warm
    new THREE.Color(0xaa7766), // brown
    new THREE.Color(0x9988aa), // purple coat
    new THREE.Color(0x88aa99), // green coat
    new THREE.Color(0xbb8888), // red jacket
];

const WALK_SPEED = 1.4; // m/s average walking speed

export class PedestrianAgents {
    constructor(scene) {
        this.scene = scene;
        this.waypoints = [];     // amenity/building [Vector3] positions
        this.peds = [];
        this.instancedMesh = null;
        this.dummy = new THREE.Object3D();
        this.active = false;
        this._spatialGrid = null; // for fast nearby-waypoint lookup
    }

    /** Initialize from features (amenity points + building centroids) */
    init(features) {
        this.waypoints = [];

        for (const f of features) {
            if (f.geometry?.type === 'Point') {
                const [x, y] = f.geometry.coordinates;
                this.waypoints.push(new THREE.Vector3(x, 0.8, -y));
            } else if (f.properties?.osm_type === 'building' && f.geometry?.type === 'Polygon') {
                const ring = f.geometry.coordinates?.[0];
                if (!ring || ring.length < 3) continue;
                let cx = 0, cy = 0;
                for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
                cx /= ring.length;
                cy /= ring.length;
                this.waypoints.push(new THREE.Vector3(cx, 0.8, -cy));
            }
        }

        if (this.waypoints.length < 2) return;

        // Build spatial grid for fast nearest-waypoint queries
        this._buildSpatialGrid();

        // Create instanced mesh — capsule-like shape
        const geom = new THREE.CapsuleGeometry(0.3, 0.8, 2, 4);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            flatShading: true,
        });

        this.instancedMesh = new THREE.InstancedMesh(geom, mat, MAX_PEDESTRIANS);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.name = 'pedestrians';

        // Spawn pedestrians
        const count = Math.min(MAX_PEDESTRIANS, Math.floor(this.waypoints.length * 0.08));
        for (let i = 0; i < count; i++) {
            const startIdx = Math.floor(Math.random() * this.waypoints.length);
            const targetIdx = this._pickNearbyTarget(startIdx);

            const pos = this.waypoints[startIdx].clone();
            pos.x += (Math.random() - 0.5) * 5;
            pos.z += (Math.random() - 0.5) * 5;

            const ped = {
                pos,
                target: this.waypoints[targetIdx].clone(),
                speed: WALK_SPEED * (0.7 + Math.random() * 0.6),
                colorIdx: Math.floor(Math.random() * PED_COLORS.length),
                waitTimer: 0, // pause at destination (seconds)
            };
            this.peds.push(ped);
            this.instancedMesh.setColorAt(i, PED_COLORS[ped.colorIdx]);
        }

        // Hide unused
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        for (let i = count; i < MAX_PEDESTRIANS; i++) {
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceColor.needsUpdate = true;
        this.scene.add(this.instancedMesh);
        this.active = true;
    }

    /** Build a spatial hash grid for quick nearby-waypoint lookups */
    _buildSpatialGrid() {
        const cellSize = 100; // meters
        this._gridCellSize = cellSize;
        this._grid = new Map();

        for (let i = 0; i < this.waypoints.length; i++) {
            const wp = this.waypoints[i];
            const cx = Math.floor(wp.x / cellSize);
            const cz = Math.floor(wp.z / cellSize);
            const key = `${cx},${cz}`;
            if (!this._grid.has(key)) this._grid.set(key, []);
            this._grid.get(key).push(i);
        }
    }

    /** Pick a nearby waypoint weighted by inverse distance (closer = more likely) */
    _pickNearbyTarget(fromIdx) {
        const wp = this.waypoints[fromIdx];
        const cellSize = this._gridCellSize;
        const cx = Math.floor(wp.x / cellSize);
        const cz = Math.floor(wp.z / cellSize);

        // Search surrounding cells
        const candidates = [];
        for (let dx = -2; dx <= 2; dx++) {
            for (let dz = -2; dz <= 2; dz++) {
                const key = `${cx + dx},${cz + dz}`;
                const cell = this._grid?.get(key);
                if (cell) candidates.push(...cell);
            }
        }

        // Filter out self and compute weights
        const filtered = candidates.filter(i => i !== fromIdx);
        if (filtered.length === 0) {
            // Fallback: any random waypoint
            return (fromIdx + 1 + Math.floor(Math.random() * (this.waypoints.length - 1))) % this.waypoints.length;
        }

        // Weighted random by inverse distance
        const weights = filtered.map(i => {
            const d = wp.distanceTo(this.waypoints[i]);
            return 1 / (d + 5); // +5 to avoid division issues
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * totalWeight;
        for (let i = 0; i < filtered.length; i++) {
            r -= weights[i];
            if (r <= 0) return filtered[i];
        }
        return filtered[filtered.length - 1];
    }

    update(dt, speed = 1) {
        if (!this.active || !this.instancedMesh) return;

        for (let i = 0; i < this.peds.length; i++) {
            const p = this.peds[i];

            // Handle waiting at destination
            if (p.waitTimer > 0) {
                p.waitTimer -= dt * speed;
                this.dummy.position.copy(p.pos);
                this.dummy.scale.set(1, 1, 1);
                this.dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
                continue;
            }

            const dir = new THREE.Vector3().subVectors(p.target, p.pos);
            const dist = dir.length();

            if (dist < 2) {
                // Arrived — pause briefly, then pick new nearby destination
                p.waitTimer = 1 + Math.random() * 4; // 1-5 seconds wait
                const nearestIdx = this._findNearestWaypoint(p.pos);
                const newTarget = this._pickNearbyTarget(nearestIdx);
                p.target = this.waypoints[newTarget].clone();
            } else {
                // Walk toward target
                dir.normalize();
                const step = p.speed * dt * speed;
                p.pos.add(dir.multiplyScalar(Math.min(step, dist)));
            }

            this.dummy.position.copy(p.pos);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /** Find nearest waypoint index to a position */
    _findNearestWaypoint(pos) {
        let bestIdx = 0;
        let bestDist = Infinity;
        for (let i = 0; i < this.waypoints.length; i++) {
            const d = pos.distanceToSquared(this.waypoints[i]);
            if (d < bestDist) { bestDist = d; bestIdx = i; }
        }
        return bestIdx;
    }

    getCount() {
        return this.peds.length;
    }

    dispose() {
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        this.active = false;
    }
}
