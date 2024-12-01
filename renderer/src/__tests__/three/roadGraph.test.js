/**
 * Tests for RoadGraph — graph building and A* pathfinding.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RoadGraph } from '../../three/roadGraph';

// Create a simple road network for testing:
//   A --- B --- C
//   |           |
//   D --------- E
function createTestFeatures() {
    return [
        // Road A→B (horizontal top-left)
        {
            geometry: { type: 'LineString', coordinates: [[0, 0], [100, 0]] },
            properties: { osm_type: 'highway', highway_type: 'residential' },
        },
        // Road B→C (horizontal top-right)
        {
            geometry: { type: 'LineString', coordinates: [[100, 0], [200, 0]] },
            properties: { osm_type: 'highway', highway_type: 'residential' },
        },
        // Road A→D (vertical left)
        {
            geometry: { type: 'LineString', coordinates: [[0, 0], [0, 100]] },
            properties: { osm_type: 'highway', highway_type: 'secondary' },
        },
        // Road C→E (vertical right)
        {
            geometry: { type: 'LineString', coordinates: [[200, 0], [200, 100]] },
            properties: { osm_type: 'highway', highway_type: 'secondary' },
        },
        // Road D→E (horizontal bottom)
        {
            geometry: { type: 'LineString', coordinates: [[0, 100], [200, 100]] },
            properties: { osm_type: 'highway', highway_type: 'primary' },
        },
    ];
}

describe('RoadGraph', () => {
    let graph;

    beforeEach(() => {
        graph = new RoadGraph();
        graph.build(createTestFeatures());
    });

    it('creates nodes from road endpoints', () => {
        // Should have 5 unique nodes: A(0,0), B(100,0), C(200,0), D(0,100), E(200,100)
        expect(graph.nodeCount).toBe(5);
    });

    it('creates bidirectional edges', () => {
        // 5 roads × 2 directions = 10 edges, but edgeCount returns 5 (bidirectional counted once)
        expect(graph.edgeCount).toBe(5);
    });

    it('finds a direct path between adjacent nodes', () => {
        // A→B should be a single-step path
        const nodeA = graph.getNearestNode(0, 0);
        const nodeB = graph.getNearestNode(100, 0);
        const path = graph.findPath(nodeA, nodeB);
        expect(path).not.toBeNull();
        expect(path.length).toBe(1);
    });

    it('finds a multi-hop path', () => {
        // D→C must go D→A→B→C or D→E→C (both 2-3 hops)
        const nodeD = graph.getNearestNode(0, -100);
        const nodeC = graph.getNearestNode(200, 0);
        const path = graph.findPath(nodeD, nodeC);
        expect(path).not.toBeNull();
        expect(path.length).toBeGreaterThanOrEqual(2);
    });

    it('returns empty path when start equals end', () => {
        const nodeA = graph.getNearestNode(0, 0);
        const path = graph.findPath(nodeA, nodeA);
        expect(path).toEqual([]);
    });

    it('gets a random node', () => {
        const node = graph.getRandomNode();
        expect(node).not.toBeNull();
        expect(graph.nodes.has(node)).toBe(true);
    });

    it('getNearestNode returns closest node', () => {
        // Near (5, -5) should snap to A at (0, 0)
        const nearest = graph.getNearestNode(5, -5);
        const node = graph.nodes.get(nearest);
        expect(Math.abs(node.x)).toBeLessThan(SNAP_THRESHOLD);
    });

    it('getPointOnRoad interpolates correctly', () => {
        // Progress 0 → start of road, progress 1 → end
        const pt0 = graph.getPointOnRoad(0, 0);
        const pt1 = graph.getPointOnRoad(0, 1);
        expect(pt0.x).toBeCloseTo(0, 0);
        expect(pt1.x).toBeCloseTo(100, 0);
    });

    it('getPointOnRoad handles reverse flag', () => {
        const ptFwd = graph.getPointOnRoad(0, 0, false);
        const ptRev = graph.getPointOnRoad(0, 0, true);
        // Reversed progress=0 should give the end point
        expect(ptRev.x).toBeCloseTo(100, 0);
        expect(ptFwd.x).toBeCloseTo(0, 0);
    });

    it('skips non-drivable roads (footway, cycleway)', () => {
        const g2 = new RoadGraph();
        g2.build([
            {
                geometry: { type: 'LineString', coordinates: [[0, 0], [50, 0]] },
                properties: { osm_type: 'highway', highway_type: 'footway' },
            },
            {
                geometry: { type: 'LineString', coordinates: [[0, 0], [100, 0]] },
                properties: { osm_type: 'highway', highway_type: 'residential' },
            },
        ]);
        // Only the residential road should be added
        expect(g2.roads.length).toBe(1);
    });

    it('handles empty features', () => {
        const g2 = new RoadGraph();
        g2.build([]);
        expect(g2.nodeCount).toBe(0);
        expect(g2.roads.length).toBe(0);
    });
});

const SNAP_THRESHOLD = 5; // matches SNAP_DISTANCE in roadGraph.js
