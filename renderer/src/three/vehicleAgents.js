/**
 * vehicleAgents.js — Traffic vehicles navigating via A* pathfinding on the road graph.
 * Uses InstancedMesh for GPU performance (~200 vehicles, 1 draw call).
 * Vehicles plan multi-road routes, follow them segment by segment, then re-plan.
 */
import * as THREE from 'three';
import { RoadGraph } from './roadGraph';

const MAX_VEHICLES = 200;

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
        this.graph = new RoadGraph();
        this.vehicles = [];
        this.instancedMesh = null;
        this.dummy = new THREE.Object3D();
        this.active = false;
    }

    /** Initialize from road features — builds graph and spawns vehicles */
    init(features) {
        this.graph.build(features);

        if (this.graph.nodeCount < 2 || this.graph.roads.length === 0) return;

        // Create instanced mesh
        const geom = new THREE.BoxGeometry(3, 1.5, 2);
        const mat = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            flatShading: true,
        });

        this.instancedMesh = new THREE.InstancedMesh(geom, mat, MAX_VEHICLES);
        this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.instancedMesh.name = 'vehicles';

        // Spawn vehicles with A* routes
        const count = Math.min(MAX_VEHICLES, Math.floor(this.graph.roads.length * 0.15));
        for (let i = 0; i < count; i++) {
            const vehicle = this._createVehicle();
            if (!vehicle) continue;
            this.vehicles.push(vehicle);
            this.instancedMesh.setColorAt(i, VEHICLE_COLORS[vehicle.colorIdx]);
        }

        // Hide unused instances
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        for (let i = this.vehicles.length; i < MAX_VEHICLES; i++) {
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        if (this.instancedMesh.instanceColor) {
            this.instancedMesh.instanceColor.needsUpdate = true;
        }
        this.scene.add(this.instancedMesh);
        this.active = true;
    }

    /** Create a vehicle with a planned A* route */
    _createVehicle() {
        const startNode = this.graph.getRandomNode();
        let endNode = this.graph.getRandomNode();
        // Pick a different destination
        let tries = 0;
        while (endNode === startNode && tries++ < 10) {
            endNode = this.graph.getRandomNode();
        }

        const path = this.graph.findPath(startNode, endNode);
        if (!path || path.length === 0) {
            // Fallback: just ride a random road back and forth
            const roadIdx = Math.floor(Math.random() * this.graph.roads.length);
            return {
                path: [{ roadIdx, reverse: false }],
                pathStep: 0,
                progress: 0,
                speed: ROAD_SPEEDS[this.graph.roads[roadIdx]?.type] || ROAD_SPEEDS.default,
                colorIdx: Math.floor(Math.random() * VEHICLE_COLORS.length),
            };
        }

        const firstRoad = this.graph.roads[path[0].roadIdx];
        return {
            path,
            pathStep: 0,
            progress: Math.random() * 0.3, // start along first road
            speed: ROAD_SPEEDS[firstRoad?.type] || ROAD_SPEEDS.default,
            colorIdx: Math.floor(Math.random() * VEHICLE_COLORS.length),
        };
    }

    /** Update each frame. dt in seconds, speed = sim multiplier */
    update(dt, speed = 1) {
        if (!this.active || !this.instancedMesh) return;

        for (let i = 0; i < this.vehicles.length; i++) {
            const v = this.vehicles[i];
            const step = v.path[v.pathStep];
            if (!step) { this._replanVehicle(v); continue; }

            const road = this.graph.roads[step.roadIdx];
            if (!road) { this._replanVehicle(v); continue; }

            // Advance along current road segment
            const distStep = v.speed * dt * speed;
            v.progress += distStep / road.totalLength;

            // Move to next road in path when current one is done
            if (v.progress >= 1) {
                v.pathStep++;
                v.progress = 0;

                if (v.pathStep >= v.path.length) {
                    // Route completed — plan a new one
                    this._replanVehicle(v);
                } else {
                    // Update speed for new road type
                    const nextRoad = this.graph.roads[v.path[v.pathStep]?.roadIdx];
                    v.speed = ROAD_SPEEDS[nextRoad?.type] || ROAD_SPEEDS.default;
                }
            }

            const currentStep = v.path[v.pathStep];
            if (!currentStep) continue;

            // Get position and look-ahead on road
            const pos = this.graph.getPointOnRoad(currentStep.roadIdx, v.progress, currentStep.reverse);
            const lookAt = this.graph.getPointOnRoad(
                currentStep.roadIdx,
                Math.min(1, v.progress + 0.02),
                currentStep.reverse
            );

            this.dummy.position.copy(pos);
            this.dummy.lookAt(lookAt);
            this.dummy.scale.set(1, 1, 1);
            this.dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /** Re-plan a vehicle's route with new A* path */
    _replanVehicle(v) {
        // Pick new random destination
        const startNode = this.graph.getRandomNode();
        let endNode = this.graph.getRandomNode();
        let tries = 0;
        while (endNode === startNode && tries++ < 10) {
            endNode = this.graph.getRandomNode();
        }

        const path = this.graph.findPath(startNode, endNode);
        if (path && path.length > 0) {
            v.path = path;
            v.pathStep = 0;
            v.progress = 0;
            v.speed = ROAD_SPEEDS[this.graph.roads[path[0].roadIdx]?.type] || ROAD_SPEEDS.default;
        } else {
            // Fallback to random road
            const roadIdx = Math.floor(Math.random() * this.graph.roads.length);
            v.path = [{ roadIdx, reverse: Math.random() > 0.5 }];
            v.pathStep = 0;
            v.progress = 0;
            v.speed = ROAD_SPEEDS[this.graph.roads[roadIdx]?.type] || ROAD_SPEEDS.default;
        }
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
