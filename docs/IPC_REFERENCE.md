# IPC Reference — Electron Channels

All IPC communication between the React renderer and Electron main process is defined in the preload script (`electron/preload.js`) via `contextBridge`.

The renderer accesses these through `window.electronAPI`.

---

## City Operations

### `loadCity(bbox)` → `city:load`

Load city data from the Python sidecar.

**Direction**: Renderer → Main → Sidecar  
**Mechanism**: `ipcRenderer.invoke('city:load', { bbox })`

**Parameters**:
```javascript
bbox = "18.9,72.8,18.92,72.85"  // "south,west,north,east"
```

**Returns**:
```javascript
// Success
{
  data: { type: "FeatureCollection", features: [...], metadata: {...} }
}

// Error
{
  error: true,
  message: "Connection refused — is the engine starting?"
}
```

**Timeout**: 90 seconds

---

### `listCachedCities()` → `city:cache:list`

List all cached cities.

**Direction**: Renderer → Main → Sidecar  
**Mechanism**: `ipcRenderer.invoke('city:cache:list')`

**Returns**:
```javascript
{
  data: [
    { id: 1, name: "Colaba", feature_count: 4381, size_mb: 2.34, ... }
  ]
}
```

---

### `deleteCachedCity(cacheId)` → `city:cache:delete`

Delete a specific cache entry.

**Direction**: Renderer → Main → Sidecar  
**Mechanism**: `ipcRenderer.invoke('city:cache:delete', { cacheId })`

**Returns**:
```javascript
{ data: { deleted: true } }
```

---

## Sidecar Management

### `getSidecarInfo()` → `sidecar:info`

Get the sidecar's port and auth token.

**Direction**: Renderer → Main  
**Returns**:
```javascript
{ port: 55030, token: "a1b2c3d4-..." }
```

---

### `onSidecarStatus(callback)` → `sidecar:status`

Listen for sidecar status updates.

**Direction**: Main → Renderer (push)  
**Callback receives**:
```javascript
{
  status: "running",  // "starting" | "running" | "error" | "stopped"
  port: 55030
}
```

---

## Window Controls

### `minimizeWindow()` → `window:minimize`
### `maximizeWindow()` → `window:maximize`
### `closeWindow()` → `window:close`

Custom frameless window controls.

**Direction**: Renderer → Main  
**Mechanism**: `ipcRenderer.send()` (fire-and-forget)
