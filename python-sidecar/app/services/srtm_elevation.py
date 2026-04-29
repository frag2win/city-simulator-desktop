"""
SRTM Elevation Service — Local terrain data from NASA SRTM tiles.

Downloads 1°×1° SRTM .hgt.gz tiles from AWS S3 (free, no auth, no rate limits),
caches them locally, and samples elevation grids for any bounding box.

Data source: Mapzen/AWS elevation-tiles-prod S3 bucket
Format:     SRTM HGT — 3601×3601 grid of big-endian signed 16-bit integers
Resolution: ~30m globally (1 arc-second)
Coverage:   Global (-90° to 90° latitude)
"""
import gzip
import math
import struct
import logging
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────
S3_BASE = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"
HGT_SIZE = 3601              # SRTM1: 3601 samples per degree (1 arc-second)
HGT_BYTES = HGT_SIZE * HGT_SIZE * 2  # 2 bytes per sample
VOID_VALUE = -32768           # SRTM void marker
DEFAULT_GRID = 48             # default output grid resolution


def _tile_name(lat: int, lon: int) -> str:
    """Convert integer lat/lon to SRTM tile filename like N19E072."""
    ns = "N" if lat >= 0 else "S"
    ew = "E" if lon >= 0 else "W"
    return f"{ns}{abs(lat):02d}{ew}{abs(lon):03d}"


def _tile_url(lat: int, lon: int) -> str:
    """Full S3 URL for an SRTM tile."""
    name = _tile_name(lat, lon)
    ns_dir = name[:3]  # e.g. "N19"
    return f"{S3_BASE}/{ns_dir}/{name}.hgt.gz"


def _cache_dir(data_dir: str) -> Path:
    """Get/create the SRTM tile cache directory."""
    cache = Path(data_dir) / "srtm_cache"
    cache.mkdir(parents=True, exist_ok=True)
    return cache


async def _download_tile(lat: int, lon: int, data_dir: str) -> Optional[Path]:
    """
    Download an SRTM tile from AWS S3 and cache it locally.
    Returns the path to the cached .hgt file, or None if download fails.
    """
    name = _tile_name(lat, lon)
    cache = _cache_dir(data_dir)
    hgt_path = cache / f"{name}.hgt"

    # Already cached?
    if hgt_path.exists() and hgt_path.stat().st_size == HGT_BYTES:
        logger.info(f"SRTM tile {name} found in cache")
        return hgt_path

    url = _tile_url(lat, lon)
    logger.info(f"Downloading SRTM tile {name} from {url}")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(url)

            if resp.status_code == 404:
                # Ocean tile — no data, create a zero-filled tile
                logger.info(f"SRTM tile {name} not found (ocean), creating zero tile")
                hgt_path.write_bytes(b'\x00' * HGT_BYTES)
                return hgt_path

            resp.raise_for_status()

            # Decompress gzip
            raw = gzip.decompress(resp.content)
            if len(raw) != HGT_BYTES:
                logger.warning(
                    f"SRTM tile {name} unexpected size: {len(raw)} "
                    f"(expected {HGT_BYTES})"
                )

            hgt_path.write_bytes(raw)
            logger.info(f"SRTM tile {name} cached ({len(raw)} bytes)")
            return hgt_path

    except Exception as e:
        logger.error(f"Failed to download SRTM tile {name}: {e}")
        return None


def _read_tile(hgt_path: Path) -> list[list[int]]:
    """
    Read an HGT file into a 2D list of elevation values.
    Returns grid[row][col] where row 0 = north, row 3600 = south.
    """
    data = hgt_path.read_bytes()
    grid = []
    for row in range(HGT_SIZE):
        row_data = []
        for col in range(HGT_SIZE):
            offset = (row * HGT_SIZE + col) * 2
            val = struct.unpack_from('>h', data, offset)[0]  # big-endian int16
            if val == VOID_VALUE:
                val = 0  # fill voids with sea level
            row_data.append(val)
        grid.append(row_data)
    return grid


def _sample_elevation(
    tile_grid: list[list[int]],
    tile_lat: int,
    tile_lon: int,
    lat: float,
    lon: float,
) -> float:
    """
    Sample elevation at a specific lat/lon from a tile grid.
    Uses bilinear interpolation for smooth results.
    """
    # Position within the 1°×1° tile (0.0 = tile origin, 1.0 = next tile)
    frac_lat = lat - tile_lat   # 0..1 within tile
    frac_lon = lon - tile_lon   # 0..1 within tile

    # Convert to grid coordinates
    # Row 0 = north edge (tile_lat + 1), row 3600 = south edge (tile_lat)
    row_f = (1.0 - frac_lat) * (HGT_SIZE - 1)
    col_f = frac_lon * (HGT_SIZE - 1)

    # Clamp to valid range
    row_f = max(0.0, min(row_f, HGT_SIZE - 1))
    col_f = max(0.0, min(col_f, HGT_SIZE - 1))

    # Bilinear interpolation
    r0 = int(row_f)
    c0 = int(col_f)
    r1 = min(r0 + 1, HGT_SIZE - 1)
    c1 = min(c0 + 1, HGT_SIZE - 1)

    fr = row_f - r0
    fc = col_f - c0

    h00 = tile_grid[r0][c0]
    h10 = tile_grid[r0][c1]
    h01 = tile_grid[r1][c0]
    h11 = tile_grid[r1][c1]

    elev = (
        h00 * (1 - fr) * (1 - fc) +
        h10 * (1 - fr) * fc +
        h01 * fr * (1 - fc) +
        h11 * fr * fc
    )
    return elev


async def fetch_terrain_grid(
    north: float,
    south: float,
    east: float,
    west: float,
    data_dir: str,
    resolution: int = DEFAULT_GRID,
) -> dict:
    """
    Build an elevation grid for the given bounding box using SRTM data.

    1. Determine which 1°×1° tiles are needed
    2. Download/cache any missing tiles
    3. Sample a resolution×resolution grid across the bbox
    4. Return dict ready for Three.js terrain mesh

    Args:
        north, south, east, west: bounding box in WGS-84
        data_dir: path to app data directory for caching tiles
        resolution: output grid size (default 48×48)

    Returns:
        {
            grid: [[float]],          # row-major, row 0 = south
            resolution: int,
            min_elevation: float,
            max_elevation: float,
        }
    """
    # 1. Determine required tiles
    lat_min = int(math.floor(south))
    lat_max = int(math.floor(north))
    lon_min = int(math.floor(west))
    lon_max = int(math.floor(east))

    logger.info(
        f"Terrain grid {resolution}×{resolution} for "
        f"({south:.4f},{west:.4f}) → ({north:.4f},{east:.4f}), "
        f"tiles: lat [{lat_min}..{lat_max}] lon [{lon_min}..{lon_max}]"
    )

    # 2. Download/cache all needed tiles
    tiles: dict[tuple[int, int], list[list[int]]] = {}
    for lat in range(lat_min, lat_max + 1):
        for lon in range(lon_min, lon_max + 1):
            path = await _download_tile(lat, lon, data_dir)
            if path:
                tiles[(lat, lon)] = _read_tile(path)
            else:
                # Create zero tile as fallback
                tiles[(lat, lon)] = [[0] * HGT_SIZE for _ in range(HGT_SIZE)]

    # 3. Sample the grid
    grid = []
    min_elev = float('inf')
    max_elev = float('-inf')

    for row in range(resolution):
        lat = south + (north - south) * row / (resolution - 1)
        row_data = []

        for col in range(resolution):
            lon = west + (east - west) * col / (resolution - 1)

            # Which tile contains this point?
            tile_lat = int(math.floor(lat))
            tile_lon = int(math.floor(lon))
            tile_key = (tile_lat, tile_lon)

            tile_grid = tiles.get(tile_key)
            if tile_grid:
                elev = _sample_elevation(tile_grid, tile_lat, tile_lon, lat, lon)
            else:
                elev = 0.0

            row_data.append(round(elev, 1))
            min_elev = min(min_elev, elev)
            max_elev = max(max_elev, elev)

        grid.append(row_data)

    if min_elev == float('inf'):
        min_elev = 0.0
    if max_elev == float('-inf'):
        max_elev = 0.0

    logger.info(
        f"Terrain grid complete: "
        f"range {min_elev:.1f}m → {max_elev:.1f}m "
        f"(Δ{max_elev - min_elev:.1f}m)"
    )

    return {
        "grid": grid,
        "resolution": resolution,
        "min_elevation": round(min_elev, 1),
        "max_elevation": round(max_elev, 1),
    }
