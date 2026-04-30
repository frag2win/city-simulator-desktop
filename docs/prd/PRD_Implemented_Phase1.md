# City Simulator - Implemented Features PRD (Phase 1)

## 1. Project Overview & Vision
**Concept:** Structural Earth Simulation Engine
**Objective:** To create a structured, layered digital representation of the physical world, specifically focusing on human-built infrastructure and its spatial relationship. This engine is designed as a vector-accurate structural model, not a photorealistic game environment.

This document details the features, systems, and architectural components that have been **fully implemented and are currently operational** in the software.

---

## 2. System Architecture
The application runs on a hybrid desktop architecture designed for high-performance spatial processing and rendering.

*   **Desktop Container:** Electron (Node.js) handling native window management, file I/O operations, local caching, and IPC bridging.
*   **Geospatial Engine (Backend):** Python Sidecar (FastAPI, Uvicorn). Responsible for heavy algorithmic lifting, parsing raw geographic data, mathematical coordinate projection, and data normalization.
*   **Rendering Client (Frontend):** React + Vite UI overlaying a native WebGL 3D context powered by Three.js. Real-time rendering of massive polygon counts.

---

## 3. Implemented Core Layers

### Layer III — Human-Built Infrastructure (Active Core)
The simulator currently excels at representing permanent physical constructions created by human civilization.

#### A) Structural Buildings
*   **Vector Extraction:** Parses open-source polygon footprint data via Overpass API (`building=*`, `building:part=*`).
*   **Triangulation:** Dynamically converts 2D GeoJSON polygon rings into complex 3D meshes using Earcut triangulation.
*   **Extrusion & Height Inference:** 
    *   Reads explicit structural data (e.g., `height`, `building:levels`).
    *   Fills missing data with intelligent semantic defaults (e.g., standardizing 3 floors at 3.5m per floor if no height tags exist).
*   **Semantic Data Preservation:** Users can click individual 3D building meshes to read preserved metadata (OSM ID, building type, standard or generated names).

#### B) Transportation Networks (Roads)
*   **Vector Extraction:** Parses linear paths via Overpass API (`highway=*`).
*   **Segment Integrity:** Automatically splits cross-boundary `LineStrings` into `MultiLineStrings`, preventing renderer glitches when roads exit and re-enter the loaded bounding box.
*   **Categorization & Styling:** Maps highway classifications (motorway, trunk, primary, residential, pedestrian) to distinct render widths (1.0m to 7.0m) and varying asphalt/concrete color grading.

#### C) Amenities & POIs (Points of Interest)
*   **Vector Extraction:** Parses specific geographic coordinate nodes via Overpass API (`amenity=*`).
*   **Rendering:** Visualized as vertical 3D pylons indicating commercial, civil, or recreational structural points.

---

## 4. Implemented Rendering & Engine Features

### A) Geospatial Projection Accuracy
*   **Spherical Web Mercator Projection:** The Python backend intercepts raw WGS84 GPS coordinates (Longitude/Latitude) and mathematically flattens them into a Local Cartesian coordinate grid (X/Z in meters).
*   **True Scale:** All buildings and roads render at 1:1 metric scale relative to their real-world dimensions.

### B) Performance & LOD (Level of Detail)
*   **Distance-Based Simplification:** The Custom `LODManager.js` monitors camera distance. Buildings far from the camera drop complex geometric attributes to maintain 60 FPS.
*   **Instanced Rendering:** Massive batches of identical geometry (like agents) use hardware instancing to reduce draw calls to zero.
*   **Mesh Merging:** Road segments of the same category are merged into unified `Three.Group` meshes to optimize GPU performance.

### C) Analytical Layers & Environment
*   **Structural Heatmap:** A toggleable data visualization layer. Analyzes bounding box density and colors the local ground plane from cold (blue, sparse infrastructure) to hot (red, high-density clustering).
*   **Day/Night Cycle:** A realistic sun/moon orbital track that adjusts ambient tone mapping, realistic shadowing (PCFShadowMap), and scene fog based on the simulated time of day.
*   **Layer Toggles:** Instantaneous UI state toggles to completely hide/show buildings, roads, or amenities.

---

## 5. Implemented Simulation Systems
The engine is not just static; it simulates life within the structural vector boundaries.

### A) Agent AI (Instanced Movement)
*   **Vehicle Agents:** Dynamically spawn and accurately traverse the directional vector paths of the road network meshes.
*   **Pedestrian Agents:** Dynamically spawn and populate pedestrian paths and the spaces surrounding amenities/buildings.
*   **Pathing Logic:** Agents track along GeoJSON coordinates, aligning to the spatial grid.

---

## 6. Application Features (Desktop Client)
*   **Local SQLite Caching:** Downloaded city bounding boxes are compressed and permanently stored in an onboard SQLite database. The user can rapidly hot-load previously downloaded "Cities" instantly without hitting external APIs.
*   **City Export/Import:** Entire generated regions can be exported to standard `.geojson` files or a proprietary `.city` bundle for sharing.
*   **High-Res Export:** Integrated native Screenshot tools configured to preserve the WebGL drawing buffer for exporting ultra-high-resolution structural maps.
*   **Search & Geocoding:** Integration with OSM Nominatim API allows users to search for real-world cities by name and jump the camera context.

---

## 7. Next Immediate Phases (Roadmap Alignment)
*Based on the Structural Vision Document, the next step is establishing Layer II.*

1.  **Hydrology Implementation (Layer II):** Extracting `natural=water` and `waterway=*` to render polygonal lakes, oceans, and extruded river ribbons that conform mathematically to the structural grid.
2.  **Terrain Restoration (Layer I):** Re-implementing a stable, tiled Topological Mesh using SRTM/ASTER elevation datasets.
