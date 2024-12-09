# Development Setup

How to clone, install, and run the City Simulator locally.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| **Node.js** | 20+ | Electron + Vite + React |
| **npm** | 10+ | Package management |
| **Python** | 3.10+ | FastAPI sidecar |
| **Git** | 2.30+ | Version control |

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/frag2win/city-simulator-desktop.git
cd city-simulator-desktop
```

### 2. Install Node.js dependencies

```bash
# Root dependencies (electron, concurrently)
npm install

# Renderer dependencies (react, three, zustand)
cd renderer
npm install
cd ..
```

### 3. Set up Python virtual environment

```bash
cd python-sidecar
python -m venv .venv

# Windows
.venv\Scripts\pip install -r requirements.txt

# macOS/Linux
.venv/bin/pip install -r requirements.txt

cd ..
```

### 4. Run in development mode

```bash
npm run dev
```

This starts:
- **Vite dev server** at `http://localhost:5173` (renderer with HMR)
- **Electron app** window (loads the Vite URL)
- **Python sidecar** (auto-spawned by Electron on a random port)

### 5. Load a city

1. Press **Ctrl+L** to open the search bar
2. Type a neighborhood name (e.g., "Colaba, Mumbai")
3. Click a search result from the dropdown
4. Wait for the city to load (querying → processing → rendering)
5. Use the mouse to orbit (left-click drag), zoom (scroll), pan (right-click drag)

## npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start everything (renderer + electron + sidecar) |
| `dev:renderer` | `cd renderer && npm run dev` | Vite dev server only |
| `dev:electron` | `electron .` | Electron only (needs Vite running) |
| `build` | `cd renderer && npm run build` | Production build of renderer |

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Path to Python sidecar (optional, defaults to ./python-sidecar)
PYTHON_SIDE_CAR_PATH=./python-sidecar

# Fixed port for sidecar (optional, defaults to auto-detect)
PYTHON_SIDE_CAR_PORT=
```

## Project Structure

```
city-simulator-desktop/
├── electron/          # Main process (Electron)
├── renderer/          # Frontend (React + Three.js)
├── python-sidecar/    # Backend (FastAPI)
├── docs/              # Documentation
├── package.json       # Root config
└── .env.example       # Environment template
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full directory tree.

## Troubleshooting

See [DEBUGGING.md](./DEBUGGING.md) for common issues and fixes.
