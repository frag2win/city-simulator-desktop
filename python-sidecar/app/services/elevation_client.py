"""
Elevation client — fetches terrain height data from the Open-Meteo Elevation API.
Builds a regular grid of sample points across a bounding box and returns
a 2-D array of elevations suitable for terrain mesh generation.
"""
import asyncio
import httpx
from app.core.logger import logger

ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"
BATCH_SIZE = 50           # max points per API request (lowered to 50 to prevent 400 URI Too Long errors)
REQUEST_DELAY_S = 0.05    # polite pause between batches


async def fetch_elevation_grid(
    north: float,
    south: float,
    east: float,
    west: float,
    resolution: int = 48,
) -> dict:
    """
    Fetch a grid of elevation values for the given bounding box.

    Args:
        north, south, east, west: WGS-84 bbox corners
        resolution: number of sample points along each axis (NxN grid)

    Returns:
        dict with keys:
            grid          – 2-D list [row][col], row 0 = south, row N-1 = north
            resolution    – int
            bounds        – {north, south, east, west}
            min_elevation – float
            max_elevation – float
    """
    # Build evenly-spaced sample grid
    lats = [south + (north - south) * i / (resolution - 1) for i in range(resolution)]
    lons = [west + (east - west) * j / (resolution - 1) for j in range(resolution)]

    # Flatten into ordered list: row-by-row (south→north), col-by-col (west→east)
    points = [(lat, lon) for lat in lats for lon in lons]

    logger.info(
        f"Fetching elevation grid {resolution}×{resolution} "
        f"({len(points)} points) for bbox "
        f"N={north:.4f} S={south:.4f} E={east:.4f} W={west:.4f}"
    )

    elevations: list[float] = []

    async with httpx.AsyncClient(timeout=30) as client:
        last_valid_elevation = 0.0
        for batch_start in range(0, len(points), BATCH_SIZE):
            batch = points[batch_start : batch_start + BATCH_SIZE]
            lat_csv = ",".join(f"{p[0]:.6f}" for p in batch)
            lon_csv = ",".join(f"{p[1]:.6f}" for p in batch)

            try:
                resp = await client.get(
                    ELEVATION_URL,
                    params={"latitude": lat_csv, "longitude": lon_csv},
                )
                if resp.status_code == 200:
                    data = resp.json()
                    batch_elevs = data.get("elevation", [])
                    # Replace None / NaN with the last known valid elevation or 0
                    for e in batch_elevs:
                        if e is not None and e == e:
                            last_valid_elevation = e
                            elevations.append(e)
                        else:
                            elevations.append(last_valid_elevation)
                else:
                    logger.warning(
                        f"Open-Meteo returned {resp.status_code} for batch "
                        f"{batch_start}–{batch_start + len(batch)}"
                    )
                    # Interpolate using last known value instead of dropping a massive 0.0 hole
                    elevations.extend([last_valid_elevation] * len(batch))
            except Exception as exc:
                logger.warning(f"Elevation batch failed: {exc}")
                elevations.extend([last_valid_elevation] * len(batch))

            # Polite delay between batches
            if batch_start + BATCH_SIZE < len(points):
                await asyncio.sleep(REQUEST_DELAY_S)

    # Reshape into 2-D grid  (row 0 = south, row N-1 = north)
    grid: list[list[float]] = []
    for row in range(resolution):
        start = row * resolution
        grid.append(elevations[start : start + resolution])

    flat = [e for row in grid for e in row]
    min_elev = min(flat) if flat else 0.0
    max_elev = max(flat) if flat else 0.0

    logger.info(
        f"Elevation grid complete — range {min_elev:.1f} m … {max_elev:.1f} m "
        f"(Δ {max_elev - min_elev:.1f} m)"
    )

    return {
        "grid": grid,
        "resolution": resolution,
        "bounds": {
            "north": north,
            "south": south,
            "east": east,
            "west": west,
        },
        "min_elevation": min_elev,
        "max_elevation": max_elev,
    }
