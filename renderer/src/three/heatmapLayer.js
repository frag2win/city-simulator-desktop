/**
 * heatmapLayer.js — Density-based heatmap overlay on the ground plane.
 * Uses a viridis-inspired color scale to show building/amenity density.
 *
 * Algorithm:
 *  1. Divide the city bounding box into a grid (gridSize × gridSize cells)
 *  2. Count features (buildings + amenities) in each cell
 *  3. Normalize counts to [0, 1]
 *  4. Map each cell to a viridis color and render as a colored plane tile
 */
import * as THREE from 'three';

// Viridis-inspired color stops (7 stops, 0 = low density, 1 = high density)
const VIRIDIS = [
    new THREE.Color(0x440154), // dark purple
    new THREE.Color(0x443a83), // indigo
    new THREE.Color(0x31688e), // teal-blue
    new THREE.Color(0x21918c), // teal
    new THREE.Color(0x35b779), // green
    new THREE.Color(0x90d743), // yellow-green
    new THREE.Color(0xfde725), // bright yellow
];

function viridisColor(t) {
    // t in [0, 1] → interpolated viridis color
    t = Math.max(0, Math.min(1, t));
    const idx = t * (VIRIDIS.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, VIRIDIS.length - 1);
    const frac = idx - lo;
    const c = new THREE.Color();
    c.lerpColors(VIRIDIS[lo], VIRIDIS[hi], frac);
    return c;
}

export class HeatmapLayer {
    constructor() {
        this.group = new THREE.Group();
        this.group.name = 'heatmap';
        this.active = false;
        this.gridResolution = 40; // NxN grid cells
    }

    /**
     * Build heatmap from city features.
     * @param {Array} features - GeoJSON features array
     * @param {THREE.Box3} cityBounds - bounding box of the city group
     */
    build(features, cityBounds) {
        this.dispose();

        if (!features || features.length === 0) return;

        const size = cityBounds.getSize(new THREE.Vector3());
        const center = cityBounds.getCenter(new THREE.Vector3());
        const gridX = this.gridResolution;
        const gridZ = this.gridResolution;
        const cellW = size.x / gridX;
        const cellH = size.z / gridZ;

        if (cellW < 1 || cellH < 1) return;

        // Compute density grid
        const grid = new Float32Array(gridX * gridZ);

        for (const f of features) {
            const props = f.properties || {};
            const geom = f.geometry;
            if (!geom) continue;

            let px, pz;
            if (geom.type === 'Point') {
                px = geom.coordinates[0];
                pz = -geom.coordinates[1];
            } else if (geom.type === 'Polygon' && geom.coordinates?.[0]) {
                const ring = geom.coordinates[0];
                let cx = 0, cy = 0;
                for (const pt of ring) { cx += pt[0]; cy += pt[1]; }
                cx /= ring.length;
                cy /= ring.length;
                px = cx;
                pz = -cy;
            } else if (geom.type === 'LineString' && geom.coordinates?.length > 0) {
                // Use midpoint of road
                const mid = Math.floor(geom.coordinates.length / 2);
                px = geom.coordinates[mid][0];
                pz = -geom.coordinates[mid][1];
            } else {
                continue;
            }

            // Map to grid cell
            const xi = Math.floor((px - (center.x - size.x / 2)) / cellW);
            const zi = Math.floor((pz - (center.z - size.z / 2)) / cellH);

            if (xi >= 0 && xi < gridX && zi >= 0 && zi < gridZ) {
                // Weight by type
                const type = props.osm_type;
                if (type === 'building') grid[zi * gridX + xi] += 2;
                else if (type === 'amenity') grid[zi * gridX + xi] += 3;
                else grid[zi * gridX + xi] += 1;
            }
        }

        // Find maximum density for normalization
        let maxDensity = 0;
        for (let i = 0; i < grid.length; i++) {
            if (grid[i] > maxDensity) maxDensity = grid[i];
        }
        if (maxDensity === 0) return;

        // Build merged geometry for performance
        const cellGeom = new THREE.PlaneGeometry(cellW, cellH);
        const cellPositions = cellGeom.getAttribute('position');
        const vertexCount = cellPositions.count; // 4 vertices per plane

        // Merge all cells into one BufferGeometry
        const totalVerts = gridX * gridZ * vertexCount;
        const totalTris = gridX * gridZ * 2; // 2 triangles per cell
        const positions = new Float32Array(totalVerts * 3);
        const colors = new Float32Array(totalVerts * 3);
        const indices = [];

        let vertOffset = 0;
        let idxOffset = 0;

        for (let zi = 0; zi < gridZ; zi++) {
            for (let xi = 0; xi < gridX; xi++) {
                const density = grid[zi * gridX + xi];
                if (density === 0) continue; // skip empty cells

                const normalized = Math.pow(density / maxDensity, 0.6); // gamma for contrast
                const color = viridisColor(normalized);
                const alpha = 0.3 + normalized * 0.5; // fade out low-density cells

                const cx = (center.x - size.x / 2) + (xi + 0.5) * cellW;
                const cz = (center.z - size.z / 2) + (zi + 0.5) * cellH;

                // Copy plane vertices with offset
                for (let v = 0; v < vertexCount; v++) {
                    const baseIdx = vertOffset * 3;
                    positions[baseIdx] = cellPositions.getX(v) + cx;
                    positions[baseIdx + 1] = 0.3; // slightly above ground
                    positions[baseIdx + 2] = cellPositions.getZ(v) + cz;

                    colors[baseIdx] = color.r;
                    colors[baseIdx + 1] = color.g;
                    colors[baseIdx + 2] = color.b;

                    vertOffset++;
                }

                // Copy indices with offset
                const cellIndices = cellGeom.getIndex();
                for (let i = 0; i < cellIndices.count; i++) {
                    indices.push(cellIndices.getX(i) + idxOffset);
                }
                idxOffset += vertexCount;
            }
        }

        cellGeom.dispose();

        if (vertOffset === 0) return;

        // Create merged BufferGeometry
        const mergedGeom = new THREE.BufferGeometry();
        mergedGeom.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, vertOffset * 3), 3));
        mergedGeom.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, vertOffset * 3), 3));
        mergedGeom.setIndex(indices);
        mergedGeom.rotateX(-Math.PI / 2); // flat on XZ plane

        const material = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
        });

        const mesh = new THREE.Mesh(mergedGeom, material);
        mesh.name = 'heatmap-mesh';
        mesh.renderOrder = 1;
        this.group.add(mesh);

        // Add a legend sprite group
        this._buildLegend(center, size);

        this.active = true;
    }

    /** Build a small color-bar legend in 3D space */
    _buildLegend(center, size) {
        // Legend is a vertical bar of colored planes on the edge of the city
        const legendGroup = new THREE.Group();
        legendGroup.name = 'heatmap-legend';
        const barHeight = size.z * 0.3;
        const barWidth = size.x * 0.01;
        const steps = 20;

        for (let i = 0; i < steps; i++) {
            const t = i / (steps - 1);
            const color = viridisColor(t);
            const stepH = barHeight / steps;

            const geom = new THREE.PlaneGeometry(barWidth, stepH);
            const mat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                depthWrite: false,
            });
            const plane = new THREE.Mesh(geom, mat);
            plane.position.set(
                center.x + size.x / 2 + barWidth * 2,
                barHeight * 0.5 + 5,
                center.z - barHeight / 2 + stepH * i + stepH / 2
            );
            plane.lookAt(plane.position.x + 1, plane.position.y, plane.position.z);
            legendGroup.add(plane);
        }

        this.group.add(legendGroup);
    }

    setVisible(visible) {
        this.group.visible = visible;
    }

    dispose() {
        this.group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        });
        // Remove children
        while (this.group.children.length > 0) {
            this.group.remove(this.group.children[0]);
        }
        this.active = false;
    }
}
