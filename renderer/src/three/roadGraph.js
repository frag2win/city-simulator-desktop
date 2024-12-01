/**
 * roadGraph.js — Builds a navigable graph from road GeoJSON features.
 * Used by vehicle agents for A* pathfinding along actual road networks.
 *
 * Graph structure:
 *   nodes: Map<nodeId, { x, z, edges: [{ to, dist, roadIdx, segStart }] }>
 *   roads: Array of { points: [Vector3], type, totalLength }
 *
 * Nodes are created at road endpoints and intersections (where roads share nearby coords).
 */
import * as THREE from 'three';

const SNAP_DISTANCE = 3; // meters — merge nodes within this distance

export class RoadGraph {
    constructor() {
        this.nodes = new Map();   // nodeId → { x, z, edges: [] }
        this.roads = [];          // indexed road data
        this._nextId = 0;
    }

    /**
     * Build graph from GeoJSON features.
     * @param {Array} features — GeoJSON features (already projected to meters)
     */
    build(features) {
        const roadFeatures = features.filter(
            (f) => f.properties?.osm_type === 'highway' && f.geometry?.type === 'LineString'
        );

        // Phase 1: Collect all road polylines
        const rawRoads = [];
        for (const f of roadFeatures) {
            const coords = f.geometry.coordinates;
            if (!coords || coords.length < 2) continue;

            const type = f.properties?.highway_type || 'default';
            // Skip non-drivable roads
            if (['footway', 'cycleway', 'path'].includes(type)) continue;

            const points = coords.map(([x, y]) => new THREE.Vector3(x, 1.5, -y));
            let totalLength = 0;
            for (let i = 1; i < points.length; i++) {
                totalLength += points[i].distanceTo(points[i - 1]);
            }
            if (totalLength < 3) continue;

            rawRoads.push({ points, type, totalLength });
        }

        this.roads = rawRoads;

        // Phase 2: Create nodes at road endpoints, snapping nearby endpoints together
        const coordToNode = []; // { x, z, nodeId }

        const getOrCreateNode = (x, z) => {
            // Check for existing nearby node (snap)
            for (const c of coordToNode) {
                const dx = c.x - x;
                const dz = c.z - z;
                if (dx * dx + dz * dz < SNAP_DISTANCE * SNAP_DISTANCE) {
                    return c.nodeId;
                }
            }
            const nodeId = this._nextId++;
            this.nodes.set(nodeId, { x, z, edges: [] });
            coordToNode.push({ x, z, nodeId });
            return nodeId;
        };

        // Phase 3: Create edges — each road becomes a graph edge from its start to end node
        for (let ri = 0; ri < this.roads.length; ri++) {
            const road = this.roads[ri];
            const startPt = road.points[0];
            const endPt = road.points[road.points.length - 1];

            const startNode = getOrCreateNode(startPt.x, startPt.z);
            const endNode = getOrCreateNode(endPt.x, endPt.z);

            // Add bidirectional edges (most city roads allow both directions conceptually)
            this.nodes.get(startNode).edges.push({
                to: endNode,
                dist: road.totalLength,
                roadIdx: ri,
                reverse: false,
            });
            this.nodes.get(endNode).edges.push({
                to: startNode,
                dist: road.totalLength,
                roadIdx: ri,
                reverse: true,
            });

            // Also create intermediate nodes at road junctions (every N meters)
            // This enables more interesting pathfinding on long roads
        }
    }

    /**
     * A* shortest-path from startNode to endNode.
     * Returns array of { roadIdx, reverse } steps, or null if unreachable.
     */
    findPath(startNode, endNode) {
        if (!this.nodes.has(startNode) || !this.nodes.has(endNode)) return null;
        if (startNode === endNode) return [];

        const endData = this.nodes.get(endNode);
        const heuristic = (nodeId) => {
            const n = this.nodes.get(nodeId);
            const dx = n.x - endData.x;
            const dz = n.z - endData.z;
            return Math.sqrt(dx * dx + dz * dz);
        };

        const openSet = new Set([startNode]);
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();
        gScore.set(startNode, 0);
        fScore.set(startNode, heuristic(startNode));

        const MAX_ITERATIONS = 2000;
        let iterations = 0;

        while (openSet.size > 0 && iterations++ < MAX_ITERATIONS) {
            // Get node with lowest fScore
            let current = null;
            let lowestF = Infinity;
            for (const id of openSet) {
                const f = fScore.get(id) ?? Infinity;
                if (f < lowestF) { lowestF = f; current = id; }
            }

            if (current === endNode) {
                // Reconstruct path
                const path = [];
                let c = endNode;
                while (cameFrom.has(c)) {
                    const edge = cameFrom.get(c);
                    path.unshift({ roadIdx: edge.roadIdx, reverse: edge.reverse });
                    c = edge.from;
                }
                return path;
            }

            openSet.delete(current);
            const node = this.nodes.get(current);

            for (const edge of node.edges) {
                const tentG = (gScore.get(current) ?? Infinity) + edge.dist;
                if (tentG < (gScore.get(edge.to) ?? Infinity)) {
                    cameFrom.set(edge.to, { from: current, roadIdx: edge.roadIdx, reverse: edge.reverse });
                    gScore.set(edge.to, tentG);
                    fScore.set(edge.to, tentG + heuristic(edge.to));
                    openSet.add(edge.to);
                }
            }
        }

        return null; // No path found
    }

    /**
     * Get a random node ID from the graph.
     */
    getRandomNode() {
        const keys = Array.from(this.nodes.keys());
        if (keys.length === 0) return null;
        return keys[Math.floor(Math.random() * keys.length)];
    }

    /**
     * Get the node nearest to a world position.
     */
    getNearestNode(x, z) {
        let bestId = null;
        let bestDist = Infinity;
        for (const [id, node] of this.nodes) {
            const dx = node.x - x;
            const dz = node.z - z;
            const d = dx * dx + dz * dz;
            if (d < bestDist) { bestDist = d; bestId = id; }
        }
        return bestId;
    }

    /**
     * Get a point along road at progress [0,1].
     */
    getPointOnRoad(roadIdx, progress, reverse = false) {
        const road = this.roads[roadIdx];
        if (!road) return new THREE.Vector3();
        const pts = road.points;
        const p = reverse ? (1 - progress) : progress;
        const clampedP = Math.max(0, Math.min(1, p));
        const totalIdx = (pts.length - 1) * clampedP;
        const idx = Math.floor(totalIdx);
        const frac = totalIdx - idx;
        if (idx >= pts.length - 1) return pts[pts.length - 1].clone();
        return new THREE.Vector3().lerpVectors(pts[idx], pts[idx + 1], frac);
    }

    get nodeCount() { return this.nodes.size; }
    get edgeCount() {
        let n = 0;
        for (const node of this.nodes.values()) n += node.edges.length;
        return n / 2; // bidirectional edges counted once
    }
}
