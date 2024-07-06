/**
 * pedestrianAgents.js — Pedestrians walking between amenity points.
 * Uses InstancedMesh (small spheres) for GPU performance.
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
        this.waypoints = [];     // amenity [x, z] positions
        this.peds = [];          // { pos, target, speed }
        this.instancedMesh = null;
        this.dummy = new THREE.Object3D();
        this.active = false;
    }

    /** Initialize from features (amenity points + building centroids) */
    init(features) {
        // Collect walkable waypoints from amenities and building centroids
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

        // Create instanced mesh
        const geom = new THREE.SphereGeometry(0.5, 4, 3);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            flatShading: true,
        });

        this.instancedMesh = new THREE.InstancedMesh(geom, mat, MAX_PEDESTRIANS);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.name = 'pedestrians';

        // Spawn pedestrians near random waypoints
        const count = Math.min(MAX_PEDESTRIANS, Math.floor(this.waypoints.length * 0.08));
        for (let i = 0; i < count; i++) {
            const startIdx = Math.floor(Math.random() * this.waypoints.length);
            let endIdx = Math.floor(Math.random() * this.waypoints.length);
            if (endIdx === startIdx) endIdx = (endIdx + 1) % this.waypoints.length;

            const pos = this.waypoints[startIdx].clone();
            // Offset slightly from exact waypoint
            pos.x += (Math.random() - 0.5) * 5;
            pos.z += (Math.random() - 0.5) * 5;

            this.peds.push({
                pos,
                target: this.waypoints[endIdx].clone(),
                speed: WALK_SPEED * (0.7 + Math.random() * 0.6),
                colorIdx: Math.floor(Math.random() * PED_COLORS.length),
            });

            this.instancedMesh.setColorAt(i, PED_COLORS[this.peds[i].colorIdx]);
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

    update(dt, speed = 1) {
        if (!this.active || !this.instancedMesh) return;

        for (let i = 0; i < this.peds.length; i++) {
            const p = this.peds[i];
            const dir = new THREE.Vector3().subVectors(p.target, p.pos);
            const dist = dir.length();

            if (dist < 2) {
                // Reached target — pick new random destination
                const idx = Math.floor(Math.random() * this.waypoints.length);
                p.target = this.waypoints[idx].clone();
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
