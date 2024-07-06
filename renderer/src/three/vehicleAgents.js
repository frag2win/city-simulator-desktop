/**
 * vehicleAgents.js — Traffic vehicles moving along road paths.
 * Uses InstancedMesh for GPU performance (~200 vehicles, 1 draw call).
 */
import * as THREE from 'three';

const MAX_VEHICLES = 200;

// Vehicle colors (instanced mesh can't do per-instance materials, use vertex colors)
const VEHICLE_COLORS = [
    new THREE.Color(0xf5d442), // Yellow taxi
    new THREE.Color(0xeeeeee), // White car
    new THREE.Color(0xcccccc), // Silver
    new THREE.Color(0x444444), // Dark gray
    new THREE.Color(0xcc3333), // Red bus
    new THREE.Color(0x3366cc), // Blue car
];

// Speed by road type (m/s)
const ROAD_SPEEDS = {
    motorway: 22,  // ~80 km/h
    trunk: 18,
    primary: 14,
    secondary: 11,
    tertiary: 9,
    residential: 7, // ~25 km/h
    service: 5,
    default: 8,
};

export class VehicleAgents {
    constructor(scene) {
        this.scene = scene;
        this.roads = [];         // array of { coords: [[x,y,z]...], type, totalLength }
        this.vehicles = [];      // array of { roadIdx, progress, speed, colorIdx }
        this.instancedMesh = null;
        this.dummy = new THREE.Object3D();
        this.active = false;
    }

    /** Initialize from road features */
    init(features) {
        // Collect road paths
        this.roads = [];
        const roadFeatures = features.filter(
            (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
        );

        for (const road of roadFeatures) {
            const coords = road.geometry.coordinates;
            if (!coords || coords.length < 2) continue;

            // Convert to 3D points (same mapping as roadGeometry.js)
            const points = coords.map(([x, y]) => new THREE.Vector3(x, 1.5, -y));

            // Compute total path length
            let totalLength = 0;
            for (let i = 1; i < points.length; i++) {
                totalLength += points[i].distanceTo(points[i - 1]);
            }
            if (totalLength < 5) continue; // skip tiny roads

            this.roads.push({
                points,
                type: road.properties?.highway_type || 'default',
                totalLength,
            });
        }

        if (this.roads.length === 0) return;

        // Create instanced mesh
        const geom = new THREE.BoxGeometry(3, 1.5, 2);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            flatShading: true,
        });

        this.instancedMesh = new THREE.InstancedMesh(geom, mat, MAX_VEHICLES);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.name = 'vehicles';

        // Spawn vehicles on random roads
        const count = Math.min(MAX_VEHICLES, Math.floor(this.roads.length * 0.15));
        for (let i = 0; i < count; i++) {
            const roadIdx = Math.floor(Math.random() * this.roads.length);
            const road = this.roads[roadIdx];
            const colorIdx = Math.floor(Math.random() * VEHICLE_COLORS.length);

            this.vehicles.push({
                roadIdx,
                progress: Math.random(), // 0-1 along road
                speed: ROAD_SPEEDS[road.type] || ROAD_SPEEDS.default,
                colorIdx,
                direction: Math.random() > 0.5 ? 1 : -1,
            });

            this.instancedMesh.setColorAt(i, VEHICLE_COLORS[colorIdx]);
        }

        // Hide unused instances
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        for (let i = count; i < MAX_VEHICLES; i++) {
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceColor.needsUpdate = true;
        this.scene.add(this.instancedMesh);
        this.active = true;
    }

    /** Update each frame. dt in seconds, speed = sim multiplier */
    update(dt, speed = 1) {
        if (!this.active || !this.instancedMesh) return;

        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            const road = this.roads[v.roadIdx];

            // Advance along road
            const distStep = v.speed * dt * speed;
            v.progress += (distStep / road.totalLength) * v.direction;

            // Respawn when reaching end
            if (v.progress > 1 || v.progress < 0) {
                v.roadIdx = Math.floor(Math.random() * this.roads.length);
                v.progress = v.direction > 0 ? 0 : 1;
                v.speed = ROAD_SPEEDS[this.roads[v.roadIdx].type] || ROAD_SPEEDS.default;
            }

            // Get position on road path
            const pos = this._getPointOnPath(road.points, v.progress);
            const lookAt = this._getPointOnPath(road.points, Math.min(1, v.progress + 0.02 * v.direction));

            this.dummy.position.copy(pos);
            this.dummy.lookAt(lookAt);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /** Get interpolated point along path at progress [0,1] */
    _getPointOnPath(points, progress) {
        const p = Math.max(0, Math.min(1, progress));
        const totalIdx = (points.length - 1) * p;
        const idx = Math.floor(totalIdx);
        const frac = totalIdx - idx;

        if (idx >= points.length - 1) return points[points.length - 1].clone();
        return new THREE.Vector3().lerpVectors(points[idx], points[idx + 1], frac);
    }

    getCount() {
        return this.vehicles.length;
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
