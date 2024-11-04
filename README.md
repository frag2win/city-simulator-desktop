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

## Architecture

```
Electron Main Process  ←→  Python FastAPI Sidecar (localhost)
       ↕ IPC                        ↕ REST + WebSocket
React + Three.js Renderer     SpatiaLite Database
```

## Tech Stack
- **Desktop Shell:** Electron 33
- **UI:** React 18 + Vite
- **3D Engine:** Three.js
- **Backend:** Python FastAPI (sidecar process)
- **Database:** SpatiaLite (SQLite + spatial)
- **Build:** electron-builder
