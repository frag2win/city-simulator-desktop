"""
Terrain API endpoints — elevation grid from local SRTM data.
"""
from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional
from app.core.logger import logger
from app.schemas.city import BBox
from app.services.srtm_elevation import fetch_terrain_grid

router = APIRouter()

def _verify_token(authorization: Optional[str], token: str):
    """Verify Bearer token."""
    if not token:
        return
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    parts = authorization.split(" ")
    if len(parts) != 2 or parts[0] != "Bearer" or parts[1] != token:
        raise HTTPException(status_code=403, detail="Invalid token")

@router.get("/terrain")
async def get_terrain(
    bbox: str = Query(..., description="Bounding box: N,S,E,W"),
    resolution: int = Query(48, ge=8, le=128, description="Grid resolution (NxN)"),
    authorization: Optional[str] = Header(None),
):
    """
    Fetch a terrain elevation grid for a bounding box.
    Uses locally-cached SRTM tiles from NASA (via AWS S3).
    No external API rate limits — tiles are downloaded once and cached forever.
    """
    from app.core.config import settings
    _verify_token(authorization, settings.token)

    # Parse and validate bbox
    try:
        bbox_obj = BBox.from_string(bbox)
    except (ValueError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid bounding box: {str(e)}")

    # Determine data directory for SRTM tile cache
    data_dir = getattr(settings, 'data_dir', '') or ''
    if not data_dir:
        import tempfile
        data_dir = tempfile.gettempdir()

    # Fetch elevation grid from SRTM tiles
    try:
        terrain_data = await fetch_terrain_grid(
            north=bbox_obj.north,
            south=bbox_obj.south,
            east=bbox_obj.east,
            west=bbox_obj.west,
            data_dir=data_dir,
            resolution=resolution,
        )
        return terrain_data
    except Exception as e:
        logger.error(f"Failed to fetch terrain: {e}")
        raise HTTPException(status_code=502, detail=f"SRTM elevation error: {str(e)}")
