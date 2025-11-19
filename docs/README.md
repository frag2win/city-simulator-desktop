# City Simulator Desktop — Documentation

Comprehensive documentation for the **Procedural 3D City Simulator** desktop application.

## 📖 Contents

| Document | Description |
|----------|-------------|
| [Architecture Overview](./ARCHITECTURE.md) | System design, component diagram, data flow |
| [Phase 1 — Scaffolding](./PHASE_1_SCAFFOLDING.md) | Project setup, Electron + Python + React |
| [Phase 2 — Data Ingestion](./PHASE_2_DATA_INGESTION.md) | Overpass API, GeoJSON pipeline, caching |
| [Phase 3 — 3D Rendering](./PHASE_3_3D_RENDERING.md) | Three.js engine, geometry builders, camera |
| [Phase 4 — Agent Simulation](./PHASE_4_AGENT_SIMULATION.md) | Traffic, pedestrians, day/night cycle, controls |
| [API Reference](./API_REFERENCE.md) | Python sidecar REST endpoints |
| [IPC Reference](./IPC_REFERENCE.md) | Electron IPC channels and payloads |
| [Debugging Guide](./DEBUGGING.md) | Common issues, fixes, and troubleshooting |
| [Development Setup](./DEVELOPMENT_SETUP.md) | How to clone, install, and run locally |

## 🏗️ Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Scaffolding — Electron + Python sidecar + React |
| Phase 2 | ✅ Complete | Data Ingestion — Overpass API + SQLite cache |
| Phase 3 | ✅ Complete | 3D Rendering — Three.js viewport, selection, layers |
| Phase 4 | ✅ Complete | Agent Simulation — Traffic, pedestrians, time |
| Phase 5 | 🔧 In Progress | Export & Polish — Screenshots, presets, packaging |

## 🔗 Repository

- **GitHub**: [frag2win/city-simulator-desktop](https://github.com/frag2win/city-simulator-desktop)
- **Branch**: `main`
- **License**: MIT
