# Terrain Rendering — Bug Report

**Date**: 2026-02-27  
**Component**: `terrainGeometry.js`, `CityScene.jsx`  
**Severity**: Major (visual)  
**Status**: 🔧 Fix in progress

---

## Summary

After enabling terrain elevation rendering, the wireframe terrain mesh exhibits
three visual defects that break the intended "terrain sits underneath the city"
effect.

---

## Bug 1 — Terrain wireframe renders ON TOP of buildings and roads

### Observed (Screenshot 1 — small city, 1 499 features)

The cyan wireframe grid is drawn over buildings and road ribbons instead of
appearing underneath them.  Buildings are partially or fully obscured by the
wireframe, reversing the intended depth order.

### Root Cause

The terrain mesh peak vertices are placed at **y = 0** (the same Y as the
building ground plane).  All three terrain sub-meshes use:

```js
depthWrite: false   // does not contribute to depth buffer
renderOrder: 1      // draws AFTER opaque buildings
```

Because terrain shares the same Y plane as building bases, when the GPU
performs the depth test (`LEQUAL`) the terrain fragments *pass* at the same
depth as building bottoms and are drawn on top (blending via transparency).

### Fix

Push the entire terrain group down by a small offset (`group.position.y = -5`)
so that terrain vertices are consistently deeper in the depth buffer than any
building base.

---

## Bug 2 — Extreme vertical cliff walls at terrain edges

### Observed (Screenshot 2 — large city, 6 867 features)

The terrain drops sharply at edges, creating tall vertical "curtains" of cyan
wireframe lines that hang below the city like waterfalls.  This is especially
pronounced for cities with moderate-to-large elevation variation (> 30 m Δ).

### Root Cause

The vertex-Y formula `(rawElev − maxElev) × exaggeration` maps the highest
point to y = 0 and the lowest to `y = −(elevRange × exaggeration)`.

For a city with a 100 m elevation range at 1.5× exaggeration, the deepest
valley sits at **y = −150**.  Where two adjacent terrain grid cells differ
significantly in elevation, the triangulation creates near-vertical triangle
faces → visible vertical walls.

The exaggeration table does not cap the **absolute** vertical extent, only
adjusts the multiplier by range bracket.  Large ranges (50-150 m) with 1.5-2.5×
exaggeration can still produce 100-375 units of vertical depth.

### Fix

1. Cap the maximum scene-space vertical extent to a reasonable limit
   (e.g., **MAX_VERT = 80** units) so terrain undulation is gentle.
2. Compute a dynamic exaggeration factor: `min(exaggeration, MAX_VERT / elevRange)`.
3. This keeps the visual topology visible for flat cities while preventing
   dramatic vertical walls for hilly/mountainous cities.

---

## Bug 3 — Ground plane too low, creating visible dark band

### Observed (Screenshot 1)

The ground plane was moved to `y = −500` to avoid occluding terrain, but this
creates a visible dark blue rectangle edge at the bottom of the viewport.
The gap between terrain (peaks at y = 0, valleys at y = −elevRange×exag) and
ground (y = −500) is too large, exposing the void below terrain and above
ground.

### Root Cause

The ground plane was lowered to `y = -500` as a blanket fix to prevent it
from hiding terrain.  This value is too deep for cities with small elevation
ranges — terrain may only reach y = −40 while ground is at y = −500.

### Fix

Position the ground plane dynamically based on the terrain's actual vertical
extent.  If no terrain is loaded, keep the ground at y = 0.  When terrain is
present, set ground to `y = terrainMinY − 10` (just below the deepest terrain
vertex).

Alternatively, since terrain now uses `depthWrite: false`, the ground plane can
return to `y = 0` and render before terrain.  The key requirement is that the
terrain group is offset below y = 0 (Bug 1 fix), so the ground fills the
background behind the wireframe.

---

## Reproduction

1. Launch the desktop app
2. Search for any city (e.g., "Colaba, Mumbai" or "San Francisco")
3. Wait for terrain to load (appears after city geometry)
4. Orbit camera to a low angle — observe wireframe over buildings (Bug 1)
5. Search for a hilly city (e.g., "Shimla" or any city with > 30 m elevation
   range) — observe vertical cliff curtains (Bug 2)
6. Orbit camera to look downward from distance — observe dark gap below
   terrain (Bug 3)

---

## Fix Plan

All three fixes are in `terrainGeometry.js` and `CityScene.jsx`:

| Bug | File | Change |
|-----|------|--------|
| 1 | `terrainGeometry.js` | `group.position.y = -5` (push terrain below building plane) |
| 2 | `terrainGeometry.js` | Cap max vertical extent to 80 units, compute effective exaggeration |
| 3 | `CityScene.jsx` | Return ground plane to `y = 0` (works because terrain is now offset) |

---

## Screenshots

**Screenshot 1** — Terrain wireframe over buildings + visible ground gap:
> Small city (1 499 features).  Cyan wireframe covers buildings and roads.
> Dark blue ground plane edge visible at bottom.

**Screenshot 2** — Vertical cliff walls:
> Large city (6 867 features).  Terrain drops sharply creating vertical
> wireframe curtains hanging below the city.
