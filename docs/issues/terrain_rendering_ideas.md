# Issue: Explore Alternative Architectures for Terrain Rendering

**Status:** Open
**Labels:** `research`, `terrain`, `rendering`, `architecture`

## Context
Our previous implementation of Phase 6 (ArcGIS-style draping) caused severe visual artifacts. Because building footprint geometries (from OSM) and the elevation mesh (from SRTM) have vastly different resolutions, enforcing per-building Y-offsets resulted in Z-fighting, floating foundations, and clipped roads. 

We have reverted the terrain to a flat `y=0` plane and are pausing to brainstorm new architectural approaches for terrain rendering that preserve the stability of human-built infrastructure.

## Proposed Strategies for Discussion

### 1. The "Subtle Relief" Backdrop (Decoupled Terrain)
- **Concept:** Anchor the city infrastructure (buildings, roads) on a perfectly flat global plane at `y=0`. Generate the terrain mesh strictly *below* the city (capped at `y=-1`).
- **Pros:** Zero risk of buildings floating or clipping. Computationally extremely cheap (no per-building offsets).
- **Cons:** Flat city; misses out on the "hills of San Francisco" vibe.

### 2. Masked Topographical Flattening (The "Bulldozer" Approach)
- **Concept:** Modify the elevation grid *before* creating the Three.js mesh. We flatten the terrain exactly where roads and dense building clusters exist (like a virtual bulldozer), but allow the terrain to rise naturally in parks, forests, and outside the city limits.
- **Pros:** Buildings remain perfectly grounded on local flat pads. Mountains still look like mountains.
- **Cons:** Requires running spatial intersection algorithms (checking polygons against the elevation grid) in the Python sidecar, which might spike ingestion times.

### 3. Voxelized or Hexagonal Terrain (Stylized Abstraction)
- **Concept:** Instead of a smooth, interpolated triangle mesh, we convert the SRTM elevation data into discrete 3D hexagonal columns or voxels. Buildings sit cleanly on the flat top of whichever hex they belong to.
- **Pros:** Solves the clipping problem gracefully by leaning into a stylized, "board game" aesthetic that fits procedural generation well. 
- **Cons:** A significant stylistic departure from the realistic vector look.

### 4. Fragment-Shader Draping
- **Concept:** Keep the buildings geometrically flat at `y=0`, but use a custom `onBeforeCompile` shader injection to visually clip or merge the bottom of the buildings with a projected terrain depth map.
- **Pros:** Clean geometry on the CPU, pushes the hard alignment math to the GPU.
- **Cons:** High complexity to implement and debug across different Three.js materials (especially shadows).

## Next Steps
We need to prototype these options. The **"Subtle Relief" (1)** and **"Masked Flattening" (2)** are currently the strongest contenders for maintaining the structural integrity of the desktop simulation engine.

Please comment below with thoughts or additional rendering strategies!
