"""
Terrain API endpoint — returns an elevation grid for 3-D terrain rendering.
"""
from fastapi import APIRouter, Query, HTTPException, Header
from typing import Optional
from app.core.logger import logger
from app.services.elevation_client import fetch_elevation_grid
from app.schemas.city import BBox

router = APIRouter()


@router.get("/terrain")
async def get_terrain(
    bbox: str = Query(..., description="Bounding box: N,S,E,W"),
    resolution: int = Query(48, ge=8, le=128, description="Grid resolution (NxN)"),
    authorization: Optional[str] = Header(None),
):
    """
    Return an NxN elevation grid for the given bounding box.
    Elevation values are in meters (AMSL).
    """
    from app.core.config import settings

    # Token check (reuse city auth pattern)
    if settings.token:
        if not authorization:
            raise HTTPException(status_code=401, detail="Missing Authorization header")
        parts = authorization.split(" ")
        if len(parts) != 2 or parts[0] != "Bearer" or parts[1] != settings.token:
            raise HTTPException(status_code=403, detail="Invalid token")

    # Parse bbox
    try:
        bbox_obj = BBox.from_string(bbox)
    except (ValueError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid bounding box: {str(e)}")

    # Fetch elevation grid
    try:
        terrain = await fetch_elevation_grid(
            north=bbox_obj.north,
            south=bbox_obj.south,
            east=bbox_obj.east,
            west=bbox_obj.west,
            resolution=resolution,
        )
        return terrain
    except Exception as e:
        logger.error(f"Terrain fetch failed: {e}")
        raise HTTPException(status_code=502, detail=f"Failed to fetch elevation data: {str(e)}")
