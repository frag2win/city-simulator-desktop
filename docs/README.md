# City Simulator Desktop — Documentation

Comprehensive documentation for the **Procedural 3D City Simulator** desktop application.

## 📖 Contents

| Document | Description |
|----------|-------------|
| [Architecture Overview](./ARCHITECTURE.md) | System design, component diagram, data flow |
| [Phase 1 — Scaffolding](./PHASE_1_SCAFFOLDING.md) | Project setup, Electron + Python + React |
| [Phase 2 — Data Ingestion](./PHASE_2_DATA_INGESTION.md) | Overpass API, GeoJSON pipeline, caching |
| [Phase 3 — 3D Rendering](./PHASE_3_3D_RENDERING.md) | Three.js engine, geometry builders, camera |
| [API Reference](./API_REFERENCE.md) | Python sidecar REST endpoints |
| [IPC Reference](./IPC_REFERENCE.md) | Electron IPC channels and payloads |
| [Debugging Guide](./DEBUGGING.md) | Common issues, fixes, and troubleshooting |
| [Development Setup](./DEVELOPMENT_SETUP.md) | How to clone, install, and run locally |

## 🏗️ Project Status

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Scaffolding — Electron + Python sidecar + React |
| Phase 2 | ✅ Complete | Data Ingestion — Overpass API + SQLite cache |
| Phase 3 | 🔧 In Progress | 3D Rendering — Three.js viewport (core done) |
| Phase 4 | ⏳ Planned | Agent Simulation — Traffic + pedestrians |
| Phase 5 | ⏳ Planned | Export & Polish — Screenshots, packaging |

## 🔗 Repository

- **GitHub**: [frag2win/city-simulator-desktop](https://github.com/frag2win/city-simulator-desktop)
- **Branch**: `main`
- **License**: MIT
