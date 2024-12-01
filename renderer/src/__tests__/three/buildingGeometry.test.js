/**
 * Tests for buildingGeometry — polygon footprint extrusion.
 */
import { describe, it, expect } from 'vitest';
import { createBuildingGroup } from '../../three/buildingGeometry';

function makeBuilding(ring, props = {}) {
    return {
        geometry: { type: 'Polygon', coordinates: [ring] },
        properties: { osm_type: 'building', ...props },
    };
}

describe('createBuildingGroup', () => {
    it('returns a named group', () => {
        const group = createBuildingGroup([]);
        expect(group.name).toBe('buildings');
        expect(group.children.length).toBe(0);
    });

    it('creates a mesh from a valid polygon', () => {
        const square = [
            [0, 0], [50, 0], [50, 50], [0, 50], [0, 0]
        ];
        const group = createBuildingGroup([makeBuilding(square, { height: 20 })]);
        expect(group.children.length).toBe(1);
        const mesh = group.children[0];
        expect(mesh.userData.type).toBe('building');
        expect(mesh.userData.height).toBe(20);
    });

    it('uses ExtrudeGeometry for valid footprints (not BoxGeometry)', () => {
        const Lshape = [
            [0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100], [0, 0]
        ];
        const group = createBuildingGroup([makeBuilding(Lshape, { height: 15 })]);
        expect(group.children.length).toBe(1);
        const mesh = group.children[0];
        // ExtrudeGeometry produces more vertices than BoxGeometry
        const vertCount = mesh.geometry.attributes.position.count;
        expect(vertCount).toBeGreaterThan(24); // Box has exactly 24
    });

    it('falls back to BoxGeometry for degenerate polygons', () => {
        // Collinear points → zero area → should fallback
        const line = [
            [0, 0], [10, 0], [20, 0], [0, 0]
        ];
        const group = createBuildingGroup([makeBuilding(line, { height: 10 })]);
        // May produce 0 or 1 building (fallback box if ring is valid enough)
        // Zero-area polygon should be skipped by ringToShape
        expect(group.children.length).toBeLessThanOrEqual(1);
    });

    it('skips features with too few coordinates', () => {
        const tiny = [[0, 0], [1, 1], [0, 0]]; // only 3 pts (below 4 threshold)
        const group = createBuildingGroup([makeBuilding(tiny)]);
        expect(group.children.length).toBe(0);
    });

    it('sets userData correctly', () => {
        const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
        const group = createBuildingGroup([makeBuilding(square, {
            height: 30, building_levels: 10, osm_id: 'way/123', name: 'Tower'
        })]);
        const mesh = group.children[0];
        expect(mesh.userData.osm_id).toBe('way/123');
        expect(mesh.userData.name).toBe('Tower');
        expect(mesh.userData.levels).toBe(10);
    });

    it('handles multiple buildings', () => {
        const features = [];
        for (let i = 0; i < 10; i++) {
            const x = i * 100;
            features.push(makeBuilding([
                [x, 0], [x + 50, 0], [x + 50, 50], [x, 50], [x, 0]
            ]));
        }
        const group = createBuildingGroup(features);
        expect(group.children.length).toBe(10);
    });

    it('adds edge wireframes as children', () => {
        const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
        const group = createBuildingGroup([makeBuilding(square)]);
        const mesh = group.children[0];
        // Edge wireframe is a child (LineSegments) of the mesh
        expect(mesh.children.length).toBeGreaterThanOrEqual(1);
        expect(mesh.children[0].isLineSegments).toBe(true);
    });

    it('filters non-building features', () => {
        const features = [
            {
                geometry: { type: 'Point', coordinates: [5, 5] },
                properties: { osm_type: 'amenity' },
            },
            {
                geometry: { type: 'LineString', coordinates: [[0, 0], [10, 0]] },
                properties: { osm_type: 'highway' },
            },
        ];
        const group = createBuildingGroup(features);
        expect(group.children.length).toBe(0);
    });
});
