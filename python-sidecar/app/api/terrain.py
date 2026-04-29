"""
Terrain API endpoints — elevation grid fetching.
"""
import asyncio
from fastapi import APIRouter, Header, HTTPException, Query
from typing import Optional
from app.core.logger import logger
from app.schemas.city import BBox
from app.services.elevation_client import fetch_elevation_grid

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
    Uses Open-Meteo Elevation API in the background.
    """
    from app.core.config import settings
    _verify_token(authorization, settings.token)

    # Parse and validate bbox
    try:
        bbox_obj = BBox.from_string(bbox)
    except (ValueError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid bounding box: {str(e)}")

    # Fetch elevation grid
    try:
        # fetch_elevation_grid is already async and uses httpx, so we can await it directly.
        # It handles batching and rate limiting internally.
        terrain_data = await fetch_elevation_grid(
            north=bbox_obj.north,
            south=bbox_obj.south,
            east=bbox_obj.east,
            west=bbox_obj.west,
            resolution=resolution
        )
        return terrain_data
    except Exception as e:
        logger.error(f"Failed to fetch terrain: {e}")
        raise HTTPException(status_code=502, detail=f"Elevation API error: {str(e)}")
