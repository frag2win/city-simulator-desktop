# Debugging Guide

Common issues encountered during development and their solutions.

---

## 1. "fetch failed" / "Connection refused"

**Symptom**: City load fails with "Connection refused — is the engine starting?"

**Root cause**: Python sidecar failed to start or is not reachable.

**Debug steps**:
1. Check terminal output for Python error messages
2. Verify `.venv` exists: `python-sidecar/.venv/Scripts/python.exe`
3. Check if all deps are installed: `.venv/Scripts/pip list`
4. Try starting manually: `.venv/Scripts/python -m uvicorn app.main:app --port 8000`

**Fix**: Ensure virtual environment is set up:
```bash
cd python-sidecar
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
```

---

## 2. `ModuleNotFoundError: No module named 'uvicorn'`

**Symptom**: Sidecar crashes immediately on startup.

**Root cause**: Python packages installed globally, but Electron spawns a different Python.

**Fix**: Use virtual environment (same as #1). The `spawnPython.js` script prioritizes `.venv/Scripts/python.exe`.

---

## 3. "Area too large" / Overpass timeout

**Symptom**: Searching for large cities (e.g., "Mumbai") fails.

**Root cause**: Nominatim returns the full administrative boundary (600+ km²), exceeding the 25 km² limit.

**Fix**: Auto-crop is built in. The `CitySearchBar.jsx` automatically crops to ~2km × 2km if the bbox exceeds 20 km². Search for specific neighborhoods instead of full cities.

---

## 4. CORS error on cache operations

**Symptom**: Console shows "Access-Control-Allow-Origin" error on cache fetch.

**Root cause**: Renderer tried to fetch `http://127.0.0.1:PORT/city/cache` directly instead of through IPC.

**Fix**: Cache operations now route through IPC in `cityStore.js`:
```javascript
// ❌ Wrong — direct fetch from renderer
const response = await fetch(`http://127.0.0.1:${port}/city/cache`);

// ✅ Correct — through IPC
const result = await window.electronAPI.listCachedCities();
```

---

## 5. 3D scene shows only grid (no buildings)

**Symptom**: HUD shows feature counts but viewport is empty.

**Possible causes**:

| Cause | How to identify | Fix |
|-------|----------------|-----|
| Backface culling | Buildings exist in bounds but invisible | Add `side: THREE.DoubleSide` to material |
| Camera pointing wrong way | Bounds center far from (0,0,0) | Check `fitCameraToCity` updates target |
| Colors too dark | With ACES tone mapping, dark HSL = invisible | Use lightness ≥ 0.55 |
| ExtrudeGeometry fails | Complex OSM polygons crash earcut | Use BoxGeometry at centroid |

---

## 6. Road flickering / z-fighting

**Symptom**: Roads shimmer and flicker as camera moves.

**Root cause**: Road surface too close to ground plane in depth buffer.

**Fix**: Raise road Y position (0.5+) and add `polygonOffset` to material:
```javascript
material.polygonOffset = true;
material.polygonOffsetFactor = -1;
material.polygonOffsetUnits = -1;
```

---

## 7. "Electron API not available"

**Symptom**: Error modal appears when loading a city.

**Root cause**: Opened `localhost:5173` in a regular browser instead of using the Electron window.

**Fix**: Use the Electron window (has "CITY SIMULATOR" in title bar). The Vite URL is only for hot-reload, not for direct browsing.

---

## 8. Sidecar port conflicts

**Symptom**: Sidecar fails with "Address already in use".

**Fix**: The port finder in `spawnPython.js` automatically selects a free port. If issues persist, kill stale Python processes:
```bash
# Windows
taskkill /f /im python.exe

# Then restart
npm run dev
```

---

## Useful Debug Techniques

### View Electron DevTools
Right-click the Electron window → "Inspect" → Console tab

### Check Sidecar Logs
Terminal output shows Python sidecar logs prefixed with timestamp and module name.

### Test Sidecar Directly
```bash
curl http://127.0.0.1:PORT/health -H "Authorization: Bearer TOKEN"
```

### Force Cache Clear
Delete `~/.city-simulator/city_cache.db` and restart.
