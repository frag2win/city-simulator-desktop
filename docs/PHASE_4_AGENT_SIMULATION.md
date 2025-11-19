# Phase 4 — Agent Simulation

**Status**: ✅ Complete  
**Date**: February 2026

## Objective
Bring the static 3D city to life by adding moving traffic, walking pedestrians, a dynamic day/night light cycle, and a simulation control interface.

## Architecture & Implementation

### 1. Vehicle Agents (`vehicleAgents.js`)
Traffic vehicles that follow the road networks generated in Phase 3.

- **Data Source**: Uses existing `highway` features with `LineString` geometry.
- **Rendering**: Uses `THREE.InstancedMesh` (BoxGeometry) to render up to 200 vehicles in a **single draw call**, ensuring high performance.
- **Movement Logic**: 
  - Vehicles are placed on random roads.
  - They interpolate along the `LineString` points over time.
  - Speed is determined by the OSM road type (e.g., motorways are much faster than residential streets).
  - When reaching the end of a path, the vehicle automatically despawns and respawns on a new random road.
- **Visuals**: Vertex colors are used to give vehicles varied colors (yellow taxis, red buses, white/silver/blue cars).

### 2. Pedestrian Agents (`pedestrianAgents.js`)
Pedestrians walking between points of interest in the city.

- **Data Source**: Uses coordinates from `amenity` points and the computed centroids of `building` polygons as walkable waypoints.
- **Rendering**: Uses `THREE.InstancedMesh` (SphereGeometry) for up to 300 pedestrians.
- **Movement Logic**:
  - Pedestrians pick a random starting waypoint and a random destination.
  - They walk in a straight line toward the destination at an average walking speed (~1.4 m/s, slightly randomized per agent).
  - Upon reaching the destination (distance < 2m), they immediately pick a new random target waypoint.
- **Visuals**: Subdued, warm-toned vertex colors representing different clothing (coats, jackets).

### 3. Day/Night Cycle (`dayNightCycle.js`)
A dynamic lighting system that simulates the passage of time.

- **Time Tracking**: A normalized time value `[0, 1]` representing time of day (0.25 = dawn, 0.5 = noon, 0.75 = dusk, 0 = midnight).
- **Sun Movement**: A `DirectionalLight` rotates in a circular arc overhead.
- **Sky & Fog Transitions**: The Three.js scene background and fog color smoothly interpolate between predefined colors (dawn orange → day blue → dusk purple → night dark blue).
- **Ambient Lighting**: 
  - `AmbientLight` intensity dynamically scales so the scene is bright at noon but dims significantly at night.
  - Base ambient level clamped at `0.35` so buildings remain visible in total darkness.
- **Timing**: 1 full day takes exactly 60 seconds at `1×` simulation speed.

### 4. Simulation Controls (`SimulationControls.jsx` & `cityStore.js`)
React UI to control the flow of time and Agent activity.

- **Store Integration**: `cityStore.js` tracks `isPlaying`, `simSpeed`, `timeOfDay` string/icon, and live `agentCounts`.
- **UI Component**: A glassmorphism HUD panel in the bottom-left corner.
- **Features**:
  - Play / Pause button to halt all agent movement and time progression.
  - Speed selector (`0.5×`, `1×`, `2×`, `4×`).
  - Formatted time display (e.g., `18:30` + 🌅 icon).
  - Dynamic counters showing how many vehicles and pedestrians are currently loaded.

## Integration (`CityScene.jsx`)
- The Three.js animation loop `requestAnimationFrame` uses `THREE.Clock` to get `deltaT` (time since last frame).
- Every frame, the `AgentSystem` (`update(dt * speed)`) advances the day/night cycle, vehicle positions, and pedestrian positions.
- React components remain performant because high-frequency updates (agent transforms) happen entirely on the Three.js GPU side utilizing `InstancedMesh.setMatrixAt`, while low-frequency updates (clock str, agent counts) are periodically pushed to the Zustand store.

## Dependencies Added
*None new for this phase (reused `three` and standard React hooks).*
