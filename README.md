# City Simulator Desktop

Procedural 3D City Simulator — a cross-platform desktop application that transforms OpenStreetMap data into interactive, navigable 3D urban environments.

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.11+
- npm 9+

### Development

```bash
# Install dependencies
npm install

# Install Python sidecar dependencies
cd python-sidecar
pip install -r requirements.txt
cd ..

# Run in development mode
npm run dev
```

### Build

```bash
# Build for current platform
npm run build
```

### Release

Tag a version and push to trigger the CI/CD pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This produces installers for Windows (.exe), macOS (.dmg), and Linux (.AppImage/.deb) via GitHub Actions.

## Architecture

```
Electron Main Process  ←→  Python FastAPI Sidecar (localhost)
       ↕ IPC                        ↕ REST + WebSocket
React + Three.js Renderer     SpatiaLite Database
```

## Tech Stack
- **Desktop Shell:** Electron 33
- **UI:** React 18 + Vite 6
- **3D Engine:** Three.js r183
- **State:** Zustand 5
- **Backend:** Python 3.12 FastAPI (sidecar process)
- **Database:** SpatiaLite (SQLite + spatial)
- **Build:** electron-builder 25
- **Auto-update:** electron-updater via GitHub Releases

## Features

### Phase 1 — Scaffolding ✅
Electron shell, frameless window, Python sidecar lifecycle, IPC bridge

### Phase 2 — Data Ingestion ✅
Overpass API queries, schema normalization, SpatiaLite caching, progress tracking

### Phase 3 — 3D Rendering ✅
Buildings, roads, amenities as Three.js meshes, orbit camera, layer toggles, entity selection

### Phase 4 — Agent Simulation ✅
Vehicle traffic on roads, pedestrian agents, day/night cycle, simulation controls (play/pause/speed)

### Phase 5 — Polish & Release ✅
- Density heatmap overlay with Viridis color scale
- LOD (Level-of-Detail) for buildings (4-tier distance-based)
- .city file save/load with OS file association
- Screenshot export (1×/2×/4K) with native save dialog
- Auto-updater with download/install UI
- CI/CD pipeline (GitHub Actions multi-platform)
- Release packaging for Windows, macOS, Linux

## Documentation

See the [docs/](docs/) folder for detailed documentation:

- [Development Setup](docs/DEVELOPMENT_SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API_REFERENCE.md)
- [IPC Reference](docs/IPC_REFERENCE.md)
- [Debugging](docs/DEBUGGING.md)

## License

MIT
