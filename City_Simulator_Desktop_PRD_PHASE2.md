# Product Requirements Document (PRD)

# Structural Earth Simulation Engine — v2.0

| Field | Details |
|---|---|
| **Version** | 2.0 — Full Layer Expansion |
| **Status** | Draft |
| **Date** | June 2025 |
| **Platform** | Windows / macOS / Linux (Electron Desktop) |
| **Supersedes** | v1.0 — Phase 1 (Human-Built Infrastructure Core) |
| **Document Type** | Forward-Looking Product Requirements |
| **Classification** | Internal — Engineering |

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Objectives](#2-core-objectives)
3. [System Architecture Requirements](#3-system-architecture-requirements)
4. [Layer I — Terrain (Base Layer)](#4-layer-i--terrain-base-layer)
5. [Layer II — Hydrology (Water Systems)](#5-layer-ii--hydrology-water-systems)
6. [Layer III — Human-Built Infrastructure](#6-layer-iii--human-built-infrastructure)
7. [Layer IV — Vegetation & Land Cover](#7-layer-iv--vegetation--land-cover)
8. [Layer V — Subsurface & Underground Infrastructure](#8-layer-v--subsurface--underground-infrastructure)
9. [Layer VI — Atmospheric & Environmental Conditions](#9-layer-vi--atmospheric--environmental-conditions)
10. [Layer VII — Structural Simulation & Event System](#10-layer-vii--structural-simulation--event-system)
11. [Layer VIII — Temporal & Historical State](#11-layer-viii--temporal--historical-state)
12. [Structural Relationship Requirements](#12-structural-relationship-requirements)
13. [Rendering Pipeline Requirements](#13-rendering-pipeline-requirements)
14. [Performance & Scalability Requirements](#14-performance--scalability-requirements)
15. [Data Management Requirements](#15-data-management-requirements)
16. [Desktop Application Requirements](#16-desktop-application-requirements)
17. [Non-Goals](#17-non-goals)
18. [Completion Criteria](#18-completion-criteria)
19. [Layer Dependency Map](#19-layer-dependency-map)
20. [Strategic "Do Not" Guidelines](#20-strategic-do-not-guidelines)
21. [Final Definition](#21-final-definition)

---

## 1. Product Overview

The **Structural Earth Simulation Engine** is a vector-accurate, layered digital representation of the physical world. The system models the complete interaction between natural geography, hydrology, vegetation, subsurface systems, and all permanent human-built infrastructure using open, structured geospatial datasets.

This engine is not a photorealistic viewer or game environment. It is a **structural geographic system** designed to accurately represent civilization and the natural world in which it is embedded — with topological correctness, semantic metadata preservation, and simulation capacity built into its architectural core.

### 1.1 What Changed in v2.0

Version 1.0 established the human-built infrastructure core (Layer III: buildings, roads, amenities) as a fully operational phase. Version 2.0 expands the engine to its complete intended scope by adding five new primary layers and significantly deepening the simulation and desktop systems.

| Addition | Description |
|---|---|
| **Layer I — Terrain** | Real elevation mesh from open DEM datasets. All infrastructure anchors to real terrain surface. |
| **Layer II — Hydrology** | Rivers, lakes, wetlands, and coastlines as first-class geometric layers conforming to terrain. |
| **Layer IV — Vegetation** | Forest cover, agricultural land, urban greenery, and bare surfaces as structural land-cover geometry. |
| **Layer V — Subsurface** | Underground transport tunnels, utility pipelines, and subsurface infrastructure with X-ray view mode. |
| **Layer VI — Atmosphere** | Structural environmental overlays: wind fields, AQI, noise pollution, and flood risk zones. |
| **Layer VII — Simulation** | Full A\* dynamic pathfinding, multi-type agent navigation, and infrastructure event propagation with cascade modeling. |
| **Layer VIII — Temporal** | Historical OSM snapshot archive with time-scrubber and visual change-delta highlighting. |
| **Layer III Expansion** | Railway, aviation, maritime, power, industrial, water management, landuse, and administrative boundary sublayers added. |

---

## 2. Core Objectives

1. Represent real-world terrain at true metric scale using open elevation datasets.
2. Represent complete hydrological systems including rivers, lakes, wetlands, and coastlines.
3. Represent all major categories of human-built infrastructure at 1:1 scale.
4. Represent vegetation and land cover as geometric structural layers conforming to terrain.
5. Represent subsurface and underground infrastructure with correct vertical positioning below terrain.
6. Represent environmental and atmospheric conditions as structured analytical overlay layers.
7. Simulate infrastructure events with real consequence propagation across connected systems.
8. Support temporal navigation — scrubbing through historical snapshots of built infrastructure change.
9. Preserve semantic metadata from all source datasets at the feature level.
10. Maintain topological and spatial correctness between all layers.
11. Ensure global scalability through tile streaming and level-of-detail strategies.
12. Operate fully offline after initial data ingestion using local SpatiaLite storage.

---

## 3. System Architecture Requirements

The system must:

- Support tiled geospatial data loading with dynamic tile streaming as the camera moves.
- Convert WGS84 coordinates into local Cartesian coordinates via the established Web Mercator projection pipeline.
- Maintain 1:1 metric scale accuracy across all layers at all zoom levels.
- Preserve original dataset IDs and metadata from all source datasets.
- Enforce terrain conformity for all infrastructure layers — no floating or subsurface-clipping geometry unless explicitly tagged as bridge or tunnel.
- Support multi-layer rendering hierarchy covering bridge, tunnel, cutting, embankment, and underground depth indexing.
- Maintain strict process separation: geospatial computation in Python sidecar, rendering in Three.js renderer, orchestration in Electron main process.
- Support a unified layer dependency graph ensuring correct render order and preventing Z-fighting between layers.
- Provide a pluggable layer registration system so new layers can be added without modifying core engine code.

### 3.1 Layer Render Order (Z-Index Stack)

```
[8]  Atmospheric overlays          — topmost, semi-transparent analytical geometry
[7]  Temporal state overlays       — change delta highlights, snapshot markers
[6]  Simulation event visualization — closure markers, outage indicators, flood plane
[5]  Aboveground infrastructure    — buildings, roads, railways, aviation structures
[4]  Terrain-surface features      — vegetation, land cover, zoning, admin boundaries
[3]  Hydrology surface             — rivers, lakes, wetlands, coastlines
[2]  Terrain mesh                  — base elevation surface
[1]  Subsurface infrastructure     — below terrain, visible in X-ray mode only
```

---

## 4. Layer I — Terrain (Base Layer)

### 4.1 Description

The terrain layer represents the physical surface of the Earth. It is the geometric foundation upon which every other layer is anchored. No infrastructure geometry may float above or clip below the terrain surface without an explicit `bridge=yes`, `tunnel=yes`, or elevation override tag.

### 4.2 Required Datasets

| Dataset | Resolution | Role |
|---|---|---|
| SRTM 30m DEM | 30m | Primary global elevation source |
| ASTER GDEM | 30m | Gap-fill supplement for SRTM voids |
| ALOS World 3D (AW3D30) | 30m | Higher accuracy for mountainous regions |
| Copernicus DEM | 30m / 10m (EU) | Optional high-resolution refinement |
| Open-Meteo Elevation API | Point queries | Lightweight fallback for single-point lookups |

### 4.3 Required Parameters

| Parameter | Type | Notes |
|---|---|---|
| Elevation | Float (meters AMSL) | Meters above mean sea level |
| Grid resolution | Integer (meters) | Native resolution of source dataset |
| Vertical datum | String | WGS84 ellipsoid or EGM2008 geoid |
| Tile boundaries | BBox | N/S/E/W extent per tile |
| No-data mask | Boolean | Marks ocean, void, or missing cells |
| Derived slope | Float (degrees) | Computed from elevation gradient |
| Derived aspect | Float (degrees) | Compass direction of slope face |
| Terrain classification | Enum | Flat, rolling, hilly, mountainous, cliff |

### 4.4 Functional Requirements

- **Continuous elevation mesh generation:** Convert DEM raster grids into seamless 3D triangle meshes using bilinear interpolation between grid points.
- **Seamless tile stitching:** Adjacent tiles must share identical vertex positions at boundaries — no visible seams or height discontinuities.
- **Terrain LOD simplification:** Use a quadtree-based LOD system. Near tiles use full 30m resolution; distant tiles use progressively simplified meshes (60m → 120m → 240m → 480m).
- **Infrastructure vertical alignment:** All roads, railways, and ground-level features must have their Y coordinate snapped to the terrain mesh surface at their XZ position.
- **Water body masking:** Ocean and large lake cells must be rendered as flat planes at their surface elevation — not as terrain bumps.
- **Terrain normal computation:** Per-vertex normals computed for correct shading, shadow casting, and slope analysis.

---

## 5. Layer II — Hydrology (Water Systems)

### 5.1 Rivers & Streams

#### Dataset
- OSM: `waterway=*`
- HydroSHEDS (optional enhancement for flow hierarchy)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Centerline geometry | LineString | OSM way coordinates |
| River classification | Enum | River, stream, canal, drain, ditch |
| Width (meters) | Float | Explicit tag or inferred from Strahler stream order |
| Flow direction | Vector | Derived from terrain elevation gradient |
| Layer index | Integer | For bridge/tunnel interactions |
| Bridge interaction | Boolean | Whether road or railway crosses the waterway |
| Flow velocity | Float (m/s) | Estimated from gradient and classification |

#### Rendering Requirements
- Rivers rendered as 3D ribbon geometry following terrain surface contour.
- Width varies continuously along route based on classification and tagged width.
- Flow direction visualizable as animated surface vectors (toggleable layer).
- Water surface rendered as a flat plane at local elevation — terrain does not extrude into the water body.

---

### 5.2 Lakes & Reservoirs

#### Dataset
- OSM: `natural=water`
- Natural Earth (large-scale LOD for continent-level views)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Polygon geometry | Polygon | Shoreline boundary |
| Water classification | Enum | Lake, reservoir, pond, lagoon |
| Surface elevation | Float (meters) | Matched to terrain at shoreline |
| Area size | Float (km²) | Used for LOD threshold decisions |
| Shoreline-terrain conformity | Boolean | Shoreline edge must match terrain mesh exactly |

---

### 5.3 Wetlands & Swamps

#### Dataset
- OSM: `natural=wetland`
- GLWD — Global Lakes and Wetlands Database (optional supplement)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Polygon geometry | Polygon | Wetland boundary |
| Wetland subtype | Enum | Swamp, marsh, bog, reedbed, mangrove |
| Surface elevation offset | Float | Slight surface depression below surrounding terrain |
| Vegetation classification | String | Dominant plant community type |

---

### 5.4 Coastlines & Oceans

#### Dataset
- OSM: `natural=coastline`
- Natural Earth coastline (LOD fallback at low zoom levels)
- GSHHG — Global Self-Consistent Hierarchical High-Resolution Geography (optional refinement)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Coastline geometry | LineString | Mean high water mark boundary |
| Ocean boundary polygon | Polygon | Fill polygon for ocean plane generation |
| Sea level reference | Float | 0.0m datum |

---

## 6. Layer III — Human-Built Infrastructure

> Sections 6.1 and 6.2 reflect the fully implemented v1.0 state. Sections 6.3–6.10 are new requirements for v2.0.

### 6.1 Buildings ✅ *(Implemented — v1.0)*

#### Dataset
- OSM: `building=*`
- OSM: `building:part=*`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Footprint polygon | Polygon | Earcut-triangulated from OSM way |
| Height (meters) | Float | Priority: explicit → levels×3.5m → semantic default → global fallback |
| Building levels | Integer | Floor count |
| Roof type | Enum | Flat, pitched, dome, mansard (if tagged) |
| Classification | String | Residential, commercial, industrial, civic |
| OSM ID | Long | Preserved for semantic metadata lookup |
| Name | String | From OSM name tag or generated |
| Construction status | Enum | Existing, construction, proposed, demolished |

#### v2.0 Additions
- **Building:part merging:** Multiple `building:part` features belonging to the same parent must merge into a single unified mesh with correct relative heights per part.
- **Roof geometry:** Where `roof:shape` and `roof:height` tags are present, generate geometric roof geometry above the flat extrusion box.
- **Terrain conformity:** Building foundation base must snap to terrain elevation at the footprint centroid.

---

### 6.2 Road Infrastructure ✅ *(Implemented — v1.0)*

#### Dataset
- OSM: `highway=*`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Road classification | Enum | Motorway through footway |
| Width (meters) | Float | Explicit or classification-inferred |
| Lanes | Integer | Number of traffic lanes |
| Surface type | Enum | Asphalt, concrete, gravel, unpaved |
| Bridge status | Boolean | Triggers elevated geometry with support columns |
| Tunnel status | Boolean | Triggers subsurface routing in Layer V |
| Layer index | Integer | Vertical stacking order |
| Junction type | Enum | Roundabout, traffic signals, stop sign |
| One-way flag | Boolean | Directional constraint for pathfinding graph |

#### v2.0 Additions
- **A\* pathfinding graph** constructed from road network at load time for full dynamic agent navigation.
- **Spline interpolation** applied post-parse for smoother road curves between OSM nodes.
- **Bridge deck geometry:** Where `bridge=yes`, road geometry elevated above terrain with generated support column structures.
- **Tunnel portal:** Where `tunnel=yes`, geometry routed to Layer V and a portal entrance rendered at terrain surface.

---

### 6.3 Railway Infrastructure 🔲 *(New — v2.0)*

#### Dataset
- OSM: `railway=*`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Railway type | Enum | Rail, light_rail, subway, tram, monorail, funicular |
| Track geometry | LineString | Centerline path |
| Electrification | Boolean | Overhead wire system presence |
| Gauge (mm) | Integer | Track gauge if tagged |
| Bridge / tunnel status | Boolean | Structural override flag |
| Layer index | Integer | Vertical stacking order |
| Station nodes | Point | Passenger stop locations |
| Yard areas | Polygon | Freight and maintenance yard boundaries |
| Platform polygons | Polygon | Physical platform structures |

#### Rendering Requirements
- Dual-rail geometry generated from centerline with two parallel tracks offset by gauge/2.
- Sleeper crossties generated at regular intervals along the track geometry.
- Station platforms rendered as elevated concrete slabs at correct height relative to terrain.
- Electrification masts rendered at configurable intervals where `electrified=contact_line`.
- Subway lines routed to Layer V (subsurface) where `tunnel=yes`.

---

### 6.4 Aviation Infrastructure 🔲 *(New — v2.0)*

#### Dataset
- OSM: `aeroway=*`
- OurAirports open dataset (IATA/ICAO code supplement)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Runway geometry | Polygon | Full-width footprint (not centerline) |
| Runway length | Float (meters) | Derived from polygon dimensions or tagged |
| Surface type | Enum | Asphalt, concrete, grass, gravel |
| Taxiways | LineString | Taxiway centerline paths |
| Terminal polygons | Polygon | Passenger terminal footprints |
| Aerodrome boundary | Polygon | Full airport perimeter |
| Helipads | Point / Polygon | Helipad location markers |
| IATA / ICAO code | String | From OurAirports dataset |

#### Rendering Requirements
- Runways rendered as flat polygons conforming to terrain with centerline stripe geometry.
- Taxiways rendered as narrower flat paths connecting runways to terminals.
- Terminal buildings processed through the standard building extrusion pipeline with aeroway classification.
- Aerodrome boundary rendered as a perimeter line at terrain level.

---

### 6.5 Maritime & Port Infrastructure 🔲 *(New — v2.0)*

#### Dataset
- OSM: `harbour=*`, `man_made=pier`, `man_made=breakwater`, `man_made=groyne`, `waterway=dock`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Port boundary | Polygon | Operational port perimeter |
| Pier geometry | LineString / Polygon | Jetty and pier structures |
| Dock geometry | Polygon | Enclosed water dock areas |
| Harbour classification | Enum | Commercial, fishing, marina, ferry |
| Breakwater geometry | LineString | Coastal protection structures |
| Shipyard areas | Polygon | Vessel construction and maintenance zones |

#### Rendering Requirements
- Piers rendered as elevated deck geometry 1.5m above the water surface.
- Breakwaters rendered as thick elevated concrete-material geometry along coastlines.
- Dock areas rendered as enclosed water planes within port boundaries.

---

### 6.6 Power & Energy Infrastructure 🔲 *(New — v2.0)*

#### Dataset
- OSM: `power=*`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Transmission line geometry | LineString | High-voltage overhead line routes |
| Tower locations | Point | Pylon node positions |
| Substation polygons | Polygon | Electrical switching stations |
| Power plant polygons | Polygon | Generation facility footprints |
| Generator type | Enum | Coal, gas, nuclear, solar, wind, hydro |
| Voltage level (kV) | Float | If tagged |
| Cable (underground) | Boolean | Underground vs overhead routing |

#### Rendering Requirements
- Transmission towers rendered as instanced lattice-pylon geometry at tower node positions.
- Cables rendered as catenary curves sagging between adjacent tower positions.
- Substations and power plants rendered through the standard building pipeline with power classification.
- Underground power cables routed to Layer V at configurable burial depth.

#### Simulation Integration
- Power grid modeled as a weighted graph connecting substations and generation nodes.
- Power outage event propagates through grid graph downstream of failure point.
- All buildings topologically downstream of failure point switch to a darkened unpowered material state.
- Cascade respects graph topology — only nodes downstream of the failure node are affected.

---

### 6.7 Industrial & Extraction Infrastructure 🔲 *(New — v2.0)*

#### Dataset
- OSM: `landuse=industrial`, `man_made=works`, `landuse=quarry`, `man_made=refinery`, `man_made=mine`, `man_made=chimney`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Industrial zone polygon | Polygon | General industrial area boundary |
| Facility footprint | Polygon | Individual plant or works footprint |
| Extraction boundary | Polygon | Quarry or open-pit mine perimeter |
| Chimney locations | Point | Tall stack structure positions |
| Operational status | Enum | Active, disused, abandoned |
| Industrial subtype | Enum | Manufacturing, refinery, quarry, mining |

#### Rendering Requirements
- Industrial zones rendered as ground-coverage polygons with a distinct dark-brown material.
- Facility footprints processed through the standard building extrusion pipeline.
- Chimneys rendered as tall cylindrical instanced geometry at tagged point positions.
- Quarry boundaries rendered as terrain depressions — elevation mesh lowered inside extraction polygon.

---

### 6.8 Water Management & Utilities 🔲 *(New — v2.0)*

#### Dataset
- OSM: `man_made=dam`, `man_made=water_tower`, `man_made=water_works`, `man_made=wastewater_plant`, `man_made=storage_tank`, `waterway=dam`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Dam geometry | LineString / Polygon | Dam crest and body |
| Reservoir boundary | Polygon | Impounded water body polygon |
| Water treatment plant | Polygon | WTP facility footprint |
| Wastewater plant | Polygon | WWTP facility footprint |
| Storage tanks | Point / Polygon | Water or chemical storage structures |
| Water tower | Point | Elevated storage structure |

#### Rendering Requirements
- Dams rendered as thick wall geometry spanning their waterway, conforming to terrain at both abutments.
- Upstream reservoir polygon rendered as a lake surface plane at dam-crest elevation.
- Water towers rendered as instanced elevated-tank-on-column geometry at point positions.
- Storage tanks rendered as flat-topped cylindrical geometry.

---

### 6.9 Urban Landuse & Zoning 🔲 *(New — v2.0)*

#### Dataset
- OSM: `landuse=*`, `leisure=*`, `place=*`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Residential boundary | Polygon | Residential zone extent |
| Commercial boundary | Polygon | Retail and office zone extent |
| Industrial boundary | Polygon | Heavy and light industrial zone |
| Military zone | Polygon | Restricted military area |
| Construction zone | Polygon | Active development sites |
| Park / green space | Polygon | Public leisure areas |
| Cemetery | Polygon | Burial ground extents |
| Allotments | Polygon | Urban agricultural plots |

#### Rendering Requirements
- All landuse polygons rendered as ground-plane overlay geometry just above terrain surface.
- Each class has a distinct material: residential (warm beige), commercial (cool grey), industrial (dark brown), parks (green), military (olive), construction (yellow-hatched).
- Landuse polygons never occlude building footprints — buildings render above zoning layer at all times.

---

### 6.10 Administrative Boundaries 🔲 *(New — v2.0)*

#### Dataset
- OSM: `boundary=administrative`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Boundary polygon | Polygon | Full closed boundary geometry |
| Admin level | Integer | OSM levels 2–10 (country to neighborhood) |
| Jurisdiction name | String | Official place name |
| Country code | String | ISO 3166-1 alpha-2 |
| Capital flag | Boolean | Whether this jurisdiction is a capital |

#### Rendering Requirements
- Boundaries rendered as thin vertical line geometry extruded slightly above all surface layers.
- Admin level controls line weight: national (thick solid), state (medium solid), municipality (thin solid), neighborhood (dotted).
- Labels rendered as world-space text anchored to polygon centroid, visible at appropriate zoom levels only.
- Boundaries are a toggleable overlay — disabled by default.

---

## 7. Layer IV — Vegetation & Land Cover

> **Status: New in v2.0**

### 7.1 Description

The vegetation layer represents the living and non-living surface cover of the Earth — forests, agricultural fields, urban greenery, bare rock, and sand. Unlike landuse zoning (a human classification system), land cover is a physical observation of what materially covers the ground surface.

### 7.2 Required Datasets

| Dataset | Type | Role |
|---|---|---|
| OSM: `natural=wood`, `landuse=forest` | Vector polygon | Forest and woodland areas |
| OSM: `landuse=farmland`, `landuse=meadow`, `landuse=orchard` | Vector polygon | Agricultural land cover |
| OSM: `natural=scrub`, `natural=heath`, `natural=grassland` | Vector polygon | Low vegetation categories |
| OSM: `natural=bare_rock`, `natural=scree`, `natural=sand` | Vector polygon | Non-vegetated bare surfaces |
| OSM: `leisure=park`, `landuse=grass` | Vector polygon | Urban green spaces |

### 7.3 Vegetation Sublayers

#### 7.3.1 Forest & Woodland
- Polygon boundary rendered as a ground-coverage plane with a forest-green material.
- Within 300m of camera: individual tree instances rendered using `InstancedMesh` at statistically distributed positions within the polygon boundary. Density configurable per forest subtype.
- Tree instance geometry: a low-polygon silhouette shape (conifer or broadleaf). No photorealistic textures.
- Beyond 300m: tree instances hidden; ground plane is the sole representation.

#### 7.3.2 Agricultural Land
- Ground plane rendered with a field-pattern material encoding crop rows.
- Subtypes: farmland (brown), meadow (light green), orchard (dotted green), vineyard (row-pattern).
- No individual crop geometry — agricultural land is a flat ground material only.

#### 7.3.3 Scrub, Heath & Grassland
- Ground plane polygon with a material encoding the vegetation density and type.
- Subtypes visually differentiated by color and pattern only.

#### 7.3.4 Bare Surface
- Ground plane with rock, scree, sand, or gravel material.
- Integrates with terrain normal data for consistent directional lighting.

#### 7.3.5 Urban Green Space
- Parks and urban grass rendered as flat ground polygons.
- Within parks: bench, fountain, and path features rendered as small instanced geometry where tagged.

### 7.4 Parameters

| Parameter | Type | Notes |
|---|---|---|
| Polygon geometry | Polygon | Land cover boundary |
| Vegetation class | Enum | Forest, agricultural, scrub, grassland, bare, urban-green |
| Canopy density | Float (0–1) | Controls tree instance distribution density |
| Species classification | String | From OSM `species` or `taxon` tag if present |
| Terrain conformity | Boolean | Ground plane follows terrain mesh elevation |

---

## 8. Layer V — Subsurface & Underground Infrastructure

> **Status: New in v2.0**

### 8.1 Description

The subsurface layer represents all infrastructure that exists below the terrain surface. Rendering requires a dedicated **X-ray view mode** that makes the terrain mesh semi-transparent to reveal subsurface content. In standard view mode, only tunnel portals at the terrain surface are visible.

### 8.2 Underground Transport Networks

#### Dataset
- OSM: `railway=subway`, `tunnel=yes` on railway ways
- OSM: `highway=*` with `tunnel=yes`
- OSM: `man_made=tunnel`

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Tunnel geometry | LineString | Centerline path below terrain |
| Depth below surface | Float (meters) | From terrain surface to tunnel crown |
| Tunnel diameter | Float (meters) | Internal bore size |
| Lining type | Enum | Concrete, cast iron, rock-cut |
| Ventilation shaft locations | Point | Surface break point positions |
| Station cavern locations | Point / Polygon | Underground station extents |

#### Rendering Requirements
- Tunnel rendered as a cylindrical tube geometry following path at specified depth.
- Portal entry and exit geometry rendered at terrain surface where path transitions underground.
- Standard view: portal geometry only visible.
- X-ray view mode: full tunnel tube geometry visible through semi-transparent terrain mesh.

### 8.3 Underground Utility Networks

#### Dataset
- OSM: `man_made=pipeline` with depth tags
- OSM: `power=cable` with `location=underground`
- OSM: `telecom=*` tagged with underground routing

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Pipeline geometry | LineString | Centerline route |
| Depth (meters) | Float | Burial depth below terrain surface |
| Pipeline type | Enum | Water supply, sewage, gas, oil, telecom, power |
| Diameter (mm) | Float | Pipe bore size |
| Material | String | Steel, HDPE, ductile iron |

#### Rendering Requirements
- Each pipeline rendered as a cylindrical geometry at the specified burial depth.
- Type-coded colors: water (blue), sewage (brown), gas (yellow), oil (black), power (orange), telecom (grey).
- Pipelines visible only in X-ray subsurface view mode.

---

## 9. Layer VI — Atmospheric & Environmental Conditions

> **Status: New in v2.0**

### 9.1 Description

The atmospheric layer provides analytical environmental overlays rendered as semi-transparent geometry above the structural layers. This is not a climate simulation — it is a structured representation of observable environmental parameters relevant to infrastructure analysis.

All data sourced from open APIs at load time. Environmental layers are overlays only — they do not modify underlying geometry.

### 9.2 Wind Field

#### Dataset
- Open-Meteo API (wind speed and direction at surface level)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Wind speed | Float (m/s) | 10m above ground level |
| Wind direction | Float (degrees) | Meteorological convention |
| Grid resolution | Float (km) | Grid cell size of source model |
| Timestamp | ISO 8601 | Data validity time |

#### Rendering Requirements
- Animated vector arrow field above terrain surface.
- Arrow scale proportional to wind speed; color-coded by speed: calm (white) → moderate (yellow) → strong (red).
- Toggleable — off by default.

### 9.3 Air Quality Index (AQI)

#### Dataset
- OpenAQ API (open air quality measurement network)

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| AQI value | Integer (0–500) | Composite air quality index |
| PM2.5 concentration | Float (μg/m³) | Fine particulate matter |
| NO₂ concentration | Float (μg/m³) | Nitrogen dioxide |
| Station locations | Point | Measurement station coordinates |
| Timestamp | ISO 8601 | Observation time |

#### Rendering Requirements
- Semi-transparent colored volume approximately 50m above the city surface.
- Color gradient: green (good) → yellow (moderate) → orange (unhealthy) → red (hazardous).
- Measurement station markers rendered as small cylindrical indicators at station positions.
- Heatmap interpolation between station points using inverse distance weighting.

### 9.4 Noise Pollution Zones

#### Dataset
- OSM: `noise=*` tags on roads and industrial areas
- Derived computation from road classification and traffic proxy model

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Noise level | Float (dB) | Estimated or explicitly tagged |
| Source type | Enum | Road traffic, railway, industrial, aviation |
| Zone boundary | Polygon | Noise exposure zone extent |
| Distance decay | Float | Attenuation model parameter |

#### Rendering Requirements
- Ground-plane heatmap overlay showing estimated noise exposure.
- Color scale: dark blue (quiet) → light green (moderate) → orange (loud) → red (very loud).

### 9.5 Flood Risk Zones

#### Dataset
- OpenFEMA flood zone data (USA)
- EU Floods Directive data (Europe)
- OSM: `flood_prone=yes` tagged features
- Derived from terrain DEM for low-lying areas near waterways

#### Parameters

| Parameter | Type | Notes |
|---|---|---|
| Risk level | Enum | High (1-in-100yr), medium (1-in-500yr), low |
| Zone boundary | Polygon | Flood exposure zone extent |
| Elevation above waterway | Float (meters) | Derived from terrain |
| Source | String | Dataset origin for attribution |

#### Rendering Requirements
- Ground-plane polygon overlay colored by risk level: high (red, semi-transparent), medium (orange), low (yellow).
- Rendered below building geometry but above terrain surface.

---

## 10. Layer VII — Structural Simulation & Event System

> **Status: New in v2.0 — Significant expansion of v1.0 agent system**

### 10.1 Description

The simulation layer adds dynamic, consequence-bearing events to the static structural model. It transforms the engine from a passive viewer into an interactive system where user actions produce real topological effects on connected infrastructure across the scene.

### 10.2 A\* Dynamic Pathfinding

- Road and railway networks extracted from Layer III and converted into weighted graphs at load time.
- Graphs stored in SpatiaLite as adjacency lists for fast lookup without recomputation.
- **A\* algorithm** implemented in the Python sidecar for path computation between any two valid network nodes.
- Bidirectional A\* used for long paths to reduce computation time.
- Edge weights incorporate: road classification, segment length, posted speed limit (if tagged), and real-time congestion factor.
- Dynamic edge removal triggered by road closure events — rerouting computed and applied within 500ms.

### 10.3 Agent Types

| Agent Type | Network Used | Visual |
|---|---|---|
| Private vehicles | Vehicular road graph | Car geometry, instanced |
| Public buses | Vehicular road graph (bus-tagged routes) | Bus geometry, instanced |
| Trams | Railway graph (tram subtype) | Tram geometry, instanced |
| Pedestrians | Footway / pedestrian path graph | Human silhouette, instanced |
| Trains | Railway graph (rail subtype) | Train consist geometry, instanced |

### 10.4 Infrastructure Event System

#### 10.4.1 Road Closure Event

| Property | Detail |
|---|---|
| Trigger | User clicks road segment → "Close Road" |
| Effect | Edge removed from pathfinding graph |
| Visual | Road segment darkened; closure marker placed at segment |
| Propagation | All agents whose active paths include the closed segment reroute via A\* within 500ms |
| Revert | User clicks segment → "Reopen Road" |

#### 10.4.2 Power Outage Event

| Property | Detail |
|---|---|
| Trigger | User clicks building, substation, or power line → "Trigger Outage" |
| Effect | Event propagates through power grid graph downstream of failure point |
| Visual | All affected buildings switch to darkened unpowered material state |
| Propagation | Cascade follows power grid topology — only nodes topologically downstream of failure are affected |
| Revert | User clicks source → "Restore Power" — cascade reverses |

#### 10.4.3 Flood Event

| Property | Detail |
|---|---|
| Trigger | User sets water level (meters) in simulation panel |
| Effect | Animated water plane rises to specified elevation; terrain below threshold covered |
| Visual | Below-threshold buildings darken; water plane animated to level |
| Propagation | Water plane computed from terrain DEM — fills low-lying areas topographically |
| Revert | User lowers water level parameter to zero |

#### 10.4.4 Infrastructure Failure Event (Generic)

| Property | Detail |
|---|---|
| Trigger | User clicks any infrastructure feature → "Mark as Failed" |
| Effect | Feature switches to failure visual state (red highlight) |
| Visual | Metadata panel shows failure status; connected dependent features flagged as "at risk" |
| Propagation | User-defined — highlights topologically connected features |
| Revert | User marks feature as "Restored" |

### 10.5 Simulation Controls

- Speed multiplier: 0.5×, 1×, 2×, 5×, 10×
- Pause / Resume
- Step forward one simulation tick
- Reset all active events and agents to initial state
- Agent count slider per category (0–500 agents)
- SimulationClock panel displaying: simulation time, active agents by type, event count, average travel time, congestion score

---

## 11. Layer VIII — Temporal & Historical State

> **Status: New in v2.0**

### 11.1 Description

The temporal layer enables the engine to represent the evolution of the built world over time. Users can scrub through historical snapshots of infrastructure change — watching cities grow, roads appear, and buildings be demolished and replaced.

### 11.2 Data Source

- OSM historical data via the **Overpass Time Machine** (`date:` parameter in Overpass QL).
- Pre-processed snapshot archives stored locally in SpatiaLite per bounding box.
- Snapshots at configurable intervals — default: every 5 years (2000, 2005, 2010, 2015, 2020, 2025).

### 11.3 Functional Requirements

- **Time scrubber:** Slider in the simulation panel scrubs between available snapshots by year.
- **Interpolated transitions:** Features that appear or disappear between snapshots fade in or out over a short transition rather than popping instantly.
- **Change highlighting:** Optional mode highlights features added since the previous snapshot (green overlay) and removed features (red overlay) simultaneously.
- **Snapshot metadata:** Each snapshot records its pull date, feature counts by type, total coverage area, and OSM completeness score for the area and date.
- **Snapshot storage:** Historical snapshots stored as compressed GeoJSON archives within the `.city` session bundle.

### 11.4 Parameters

| Parameter | Type | Notes |
|---|---|---|
| Snapshot date | ISO 8601 date | Year of historical OSM data pull |
| Feature count delta | Integer | Features added or removed vs previous snapshot |
| Coverage area | Float (km²) | Bounding box area |
| Data completeness | Float (0–1) | OSM editing coverage quality score |

---

## 12. Structural Relationship Requirements

The system must correctly handle all OSM topological relationship tags across all layers. No geometry may violate these structural rules.

| Tag | Effect | Implementation |
|---|---|---|
| `layer=*` | Vertical stacking order for overlapping features | Integer Z-offset applied to feature mesh |
| `bridge=yes` | Feature is elevated above terrain or water | Generate support column geometry below feature; elevate road/rail deck |
| `tunnel=yes` | Feature passes below terrain | Route geometry to Layer V; render portal at terrain surface entry/exit |
| `cutting=*` | Road or railway in a ground-level cut through terrain | Terrain mesh modified to create a trench at feature location |
| `embankment=*` | Road or railway on a raised earthen bank | Terrain mesh modified to create raised fill geometry |
| `covered=yes` | Feature is roofed but not a full tunnel | Semi-transparent cover geometry added above feature |
| `location=underground` | Feature explicitly below terrain | Routed to Layer V regardless of tunnel tag presence |
| `ford=yes` | Road crosses waterway at surface level | Road geometry follows waterway surface elevation at the crossing point |

### 12.1 Elevation Override Priority

1. Explicit `ele=*` tag on feature (highest authority)
2. `layer=*` integer offset from terrain surface
3. `bridge=yes` → elevation computed from terrain plus structural clearance
4. `tunnel=yes` → negative depth below terrain surface
5. Terrain DEM surface elevation (default for all ground-level features)

---

## 13. Rendering Pipeline Requirements

### 13.1 Three.js Scene Configuration

| Parameter | Value | Reason |
|---|---|---|
| Renderer | WebGLRenderer (WebGL 2.0) | Required for instanced rendering and compute shaders |
| Shadow map | PCFSoftShadowMap | Soft-edged realistic shadows from terrain and buildings |
| Tone mapping | ACESFilmicToneMapping | Physically accurate HDR-to-LDR conversion |
| Color space | LinearSRGBColorSpace | Correct color math before tone mapping |
| Anti-aliasing | MSAA 4× | Smooth edges without excessive GPU cost |
| Draw call budget | < 500 draw calls per frame | Enforced via `InstancedMesh` and mesh merging |
| Target framerate | 60fps (45fps minimum under heavy simulation load) | On GTX 1060 / RX 580 equivalent GPU |

### 13.2 LOD Strategy

| Distance from Camera | LOD Level | Terrain Resolution | Buildings | Vegetation |
|---|---|---|---|---|
| 0 – 150m | LOD 0 — Full | 30m DEM | Full extrusion + roof geometry | Individual tree instances at full density |
| 150 – 500m | LOD 1 — High | 60m DEM | Full extrusion, no roof detail | Tree instances at 50% density |
| 500 – 1500m | LOD 2 — Medium | 120m DEM | Box approximation only | Ground plane only, no instances |
| 1500 – 5000m | LOD 3 — Low | 240m DEM | Flat footprint only | Ground plane only |
| 5000m+ | LOD 4 — Minimal | 480m DEM | Not rendered | Not rendered |

### 13.3 Memory Management

- Tile geometry disposed from GPU memory when tile moves beyond 5000m from camera.
- `THREE.BufferGeometry.dispose()` and `material.dispose()` called on every tile unload to prevent memory leaks.
- Maximum simultaneous loaded tiles: configurable in settings (default 16 tiles per tile size).
- Tile load/unload triggered by camera frustum intersection checks every 500ms.

---

## 14. Performance & Scalability Requirements

| Metric | Target | Condition |
|---|---|---|
| City load time (1km²) from cache | < 3 seconds | SpatiaLite local read |
| City load time (1km²) first load | < 15 seconds | Overpass API query + process |
| Framerate — standard scene | ≥ 60fps | 1km² city, no agents, GTX 1060 |
| Framerate — simulation active | ≥ 45fps | 200 agents + active events, GTX 1060 |
| Peak RAM (2km² + 200 agents) | < 2GB | Including Python sidecar process |
| Tile streaming latency | < 500ms | New tile geometry visible within 500ms |
| A\* path computation | < 50ms | Single agent path on a city-scale graph |
| Event propagation (closure/outage) | < 500ms | All affected agents rerouted or darkened |
| Disk per cached city (1km², all layers) | < 75MB | All layers stored in SpatiaLite |
| Installer size | < 300MB | All platforms including bundled Python binary |

---

## 15. Data Management Requirements

### 15.1 Local Database Structure

All ingested data stored in SpatiaLite, partitioned by layer:

```
city_cache/
├── terrain/          — DEM raster tiles, slope and aspect grids
├── hydrology/        — River, lake, wetland, coastline features
├── infrastructure/   — Buildings, roads, railways, aviation, maritime, power, industrial
├── vegetation/       — Land cover and forest polygons
├── subsurface/       — Tunnel, pipeline, and underground features
├── environment/      — AQI, wind, noise, and flood zone snapshots
├── simulation/       — Road graph, power graph, pre-computed adjacency lists
└── temporal/         — Historical OSM snapshots per bounding box
```

### 15.2 Data Freshness Policy (Cache TTL)

| Layer | TTL | Reason |
|---|---|---|
| Terrain (DEM) | 365 days | Terrain changes on geological timescales |
| Hydrology | 30 days | Seasonal variation; major changes possible |
| Infrastructure | 14 days | OSM edits occur frequently in active cities |
| Vegetation | 30 days | Seasonal and land-use change |
| Environment (AQI, Wind) | 1 hour | Near-real-time environmental data |
| Flood zones | 180 days | Updated annually by authorities |
| Temporal snapshots | Permanent | Historical data does not change |

### 15.3 Export Formats

| Format | Extension | Contents |
|---|---|---|
| Standard GeoJSON | `.geojson` | Single-layer feature export, RFC 7946 |
| City Bundle | `.city` | All layers + simulation state + snapshots |
| Terrain Mesh | `.obj` | Terrain mesh for external 3D tools |
| Environment Report | `.csv` | Tabular environmental parameter data |
| Screenshot | `.png` | High-resolution WebGL frame capture |

---

## 16. Desktop Application Requirements

### 16.1 Native Integration

- **Electron main process** manages window lifecycle, IPC routing, Python sidecar spawn/monitor, and all file system operations.
- **Python sidecar** (FastAPI + Uvicorn, bundled via PyInstaller) runs as a child process on a dynamic localhost port communicated to Electron at startup.
- **contextBridge** enforces renderer security — no direct Node.js access from the Three.js/React renderer process.
- **electron-builder** packages platform-specific installers: `.exe` NSIS (Windows), `.dmg` (macOS), `.AppImage` (Linux).
- **electron-updater** delivers delta auto-updates via GitHub Releases with in-app notification banner.

### 16.2 Required Native OS Features

| Feature | Implementation |
|---|---|
| `.city` file association | Double-click loads the session in-app on all three platforms |
| Native save/open dialogs | All export and import operations use OS-native file pickers |
| App window state persistence | Size, position, and maximized state saved between sessions |
| Python sidecar crash recovery | Main process pings sidecar every 5s; auto-restarts on failure with toast notification |
| Crash reporting | `electron-crashReporter` writes structured crash log to local user data directory |

### 16.3 Settings Panel

Accessible via `File > Preferences`:

- Default agent count per category on simulation start
- Cache TTL overrides per layer
- Maximum simultaneous tile count (memory budget)
- LOD distance thresholds for each level
- Screenshot export resolution (1080p / 1440p / 2160p / 4K)
- Day/night cycle animation speed
- Environmental layer data refresh interval
- X-ray subsurface view opacity

---

## 17. Non-Goals

The system does not aim to:

- Render satellite imagery or photographic raster textures as a core structural layer.
- Simulate population dynamics, demographics, or social behavior patterns.
- Provide real-time live traffic analytics from commercial data providers (Google, HERE, TomTom).
- Model climate change, atmospheric physics, or long-term environmental forecasting systems.
- Depend on proprietary or commercially licensed datasets.
- Operate as a multiplayer or networked collaborative environment.
- Replicate a game engine with rigid body physics, collision detection, or NPC behavioral AI.
- Replace professional GIS software (QGIS, ArcGIS) for spatial analysis and geoprocessing workflows.

---

## 18. Completion Criteria

The engine is considered **structurally complete for v2.0** when all of the following conditions are satisfied:

1. Terrain mesh from open DEM data renders at 1:1 metric scale with seamless tile stitching across boundaries.
2. All four hydrology sublayers (rivers, lakes, wetlands, coastlines) render conforming to the terrain surface.
3. All ten human-built infrastructure sublayers (6.1–6.10) render with correct classification and styling.
4. Vegetation layer renders forest polygons with LOD-gated tree instancing within 300m of camera.
5. Subsurface infrastructure is visible in X-ray view mode and invisible in standard surface view.
6. At least two environmental overlay layers (AQI and Wind) render from live open API data.
7. A\* pathfinding graph is constructed from the road network and used for all vehicle agent navigation.
8. Road closure and power outage events propagate correctly through their respective graphs within 500ms.
9. Temporal time-scrubber navigates between at least three historical snapshots for a test city.
10. All datasets used are open, freely licensed, and legally compliant.
11. All performance targets defined in Section 14 are met on the specified target hardware.

---

## 19. Layer Dependency Map

```
Layer VIII — Temporal
    └── requires → Layer III (Infrastructure history via Overpass Time Machine)

Layer VII — Simulation
    └── requires → Layer III (Road graph, power grid graph)
    └── requires → Layer VI (Flood event uses terrain DEM elevation data)
    └── requires → Layer I  (Terrain elevation for flood plane computation)

Layer VI — Atmosphere & Environment
    └── requires → Layer I  (Terrain for noise attenuation and flood risk models)
    └── requires → Layer II (Waterway proximity for flood risk computation)

Layer V — Subsurface
    └── requires → Layer I  (Terrain mesh for depth reference and X-ray rendering)

Layer IV — Vegetation
    └── requires → Layer I  (Terrain mesh for ground-plane conformity)

Layer III — Infrastructure
    └── requires → Layer I  (Terrain for vertical alignment, bridge deck elevation, tunnel depth)
    └── requires → Layer II (Waterway crossings for bridge detection and ford handling)

Layer II — Hydrology
    └── requires → Layer I  (Terrain for river flow direction, lake surface elevation, coastline masking)

Layer I — Terrain
    └── requires → SRTM / ASTER / Copernicus open DEM datasets (no internal layer dependency)
```

---

## 20. Strategic "Do Not" Guidelines (Architectural Guardrails)

To preserve system clarity, performance, and long-term scalability, the following constraints are mandatory and non-negotiable.

### 20.1 Data Discipline

- Do **NOT** integrate proprietary or legally restricted datasets (e.g., Google imagery, commercial map tiles, HERE data, Maxar).
- Do **NOT** mix raster satellite imagery into the core structural rendering layer.
- Do **NOT** introduce datasets that lack clear semantic tagging or schema consistency.
- Do **NOT** rely on AI-generated geometry as a primary data source.
- Do **NOT** hard-code dataset endpoint URLs — all data source endpoints must be configurable in settings.

### 20.2 Architectural Boundaries

- Do **NOT** couple rendering logic with data parsing logic — they are separate processes with a defined IPC contract.
- Do **NOT** bypass the projection pipeline (WGS84 → Web Mercator → Local Cartesian).
- Do **NOT** break tile isolation principles when scaling to larger areas.
- Do **NOT** implement global country-scale loading without tile streaming.
- Do **NOT** perform geospatial computation in the renderer process — all spatial math belongs in the Python sidecar.
- Do **NOT** access the file system from the renderer process — all I/O routes through Electron main via IPC.

### 20.3 Layer Architecture

- Do **NOT** render a higher-dependency layer before its required dependency layers are loaded (see Section 19).
- Do **NOT** allow Layer VI (Atmosphere) or Layer VIII (Temporal) to modify underlying geometry — they are read-only overlays.
- Do **NOT** register a new layer by modifying core engine source code — use the pluggable layer registration interface.
- Do **NOT** skip the layer dependency graph validation when adding new layers.

### 20.4 Simulation Scope Control

- Do **NOT** attempt full real-time traffic physics simulation at continental scale.
- Do **NOT** simulate population behavior beyond structural footprint traversal of built infrastructure.
- Do **NOT** add atmospheric fluid dynamics — flood modeling uses terrain elevation thresholds only.
- Do **NOT** turn the engine into a game engine with physics bodies or collision detection systems.

### 20.5 Visual Integrity

- Do **NOT** distort real-world scale for aesthetic reasons — 1:1 metric scale is non-negotiable.
- Do **NOT** exaggerate building heights or terrain elevation for visual drama.
- Do **NOT** fake missing data with arbitrary placeholder geometry — use documented null and default states.
- Do **NOT** use photorealistic textures as a substitute for structural geometric accuracy.

### 20.6 Performance Discipline

- Do **NOT** instantiate thousands of individual meshes when `InstancedMesh` is applicable.
- Do **NOT** allow memory leaks between tile loads — always call `dispose()` on unloaded geometry and materials.
- Do **NOT** disable frustum culling for development convenience.
- Do **NOT** block the renderer process with synchronous data operations.
- Do **NOT** exceed the 500 draw call budget per frame without explicit profiling justification.

### 20.7 Scope Protection

- Do **NOT** expand into demographic, economic, or social simulation before Layer I–III structural completeness is verified.
- Do **NOT** add features that do not map directly to one of the eight defined layers.
- Do **NOT** sacrifice architectural clarity for rapid feature additions.
- Do **NOT** begin Layer VIII (Temporal) implementation before Layer III (Infrastructure) is fully stable and tested.

---

These guardrails ensure the Structural Earth Simulation Engine remains a precise structural geographic tool rather than drifting into unrelated domains, unsustainable complexity, or scope creep that compromises its architectural integrity.

---

## 21. Final Definition

The **Structural Earth Simulation Engine** is a layered, vector-based digital model of Earth — representing terrain, hydrology, human-built infrastructure, vegetation, subsurface systems, and environmental conditions — with topological correctness, semantic metadata preservation, consequence-bearing simulation, and temporal navigation across historical states.

It is a **structural geographic engine**: precise, data-driven, open-dataset-dependent, and architecturally bounded to prevent scope drift into game development, photorealistic rendering, or complexity that cannot be sustainably maintained.

---

*— END OF DOCUMENT —*

*Structural Earth Simulation Engine | PRD v2.0 | Internal Engineering | June 2025*