"""
City API endpoints — data ingestion, caching, and management.
"""
import asyncio
from fastapi import APIRouter, Header, HTTPException, WebSocket, WebSocketDisconnect, Query
from typing import Optional
from app.core.logger import logger
from app.services.overpass_client import query_overpass, OverpassError
from app.services.schema_normalizer import normalize_overpass_response
from app.services.spatial_processor import project_geojson, compute_bbox_center
from app.schemas.city import BBox
from app.db.database import (
    init_db, get_cached_city, cache_city,
    list_cached_cities, delete_cached_city,
)

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


@router.get("/city")
async def load_city(
    bbox: str = Query(..., description="Bounding box: N,S,E,W"),
    authorization: Optional[str] = Header(None),
):
    """
    Load city data for a bounding box.
    1. Check local SQLite cache
    2. If miss: query Overpass API → normalize → project → cache → return
    3. If hit: return cached GeoJSON directly
    """
    from app.core.config import settings
    _verify_token(authorization, settings.token)

    # Parse and validate bbox
    try:
        bbox_obj = BBox.from_string(bbox)
    except (ValueError, Exception) as e:
        raise HTTPException(status_code=400, detail=f"Invalid bounding box: {str(e)}")

    # Validate area bounds (FR-E04)
    area = bbox_obj.area_km2
    if area < 0.01:
        raise HTTPException(status_code=400, detail=f"Area too small: {area:.4f} km². Minimum is 0.01 km².")
    if area > 25:
        raise HTTPException(status_code=400, detail=f"Area too large: {area:.1f} km². Maximum is 25 km².")

    # Ensure DB is initialized
    await init_db()

    # Cache key = bbox string (normalized)
    cache_key = bbox

    # Check cache
    cached = await get_cached_city(cache_key)
    if cached:
        logger.info(f"Serving city from cache: {cache_key}")
        return cached

    # Query Overpass
    try:
        overpass_bbox = bbox_obj.to_overpass_string()
        raw_data = await query_overpass(overpass_bbox)
    except OverpassError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Check for empty data (FR-E02)
    elements = raw_data.get("elements", [])
    if not elements:
        raise HTTPException(
            status_code=404,
            detail="No data found for this area. It may be ocean, uninhabited, or outside OpenStreetMap coverage."
        )

    # Normalize
    geojson = normalize_overpass_response(raw_data)

    if not geojson.get("features"):
        raise HTTPException(
            status_code=404,
            detail="No recognizable features (buildings, roads) found in this area."
        )

    # Project to local Cartesian
    center_lon, center_lat = compute_bbox_center(
        bbox_obj.north, bbox_obj.south, bbox_obj.east, bbox_obj.west
    )
    projected = project_geojson(geojson, center_lon, center_lat)

    # Add bbox to response
    projected["bbox"] = [bbox_obj.west, bbox_obj.south, bbox_obj.east, bbox_obj.north]

    # Cache result
    city_name = f"City @ {bbox_obj.north:.4f},{bbox_obj.east:.4f}"
    await cache_city(cache_key, city_name, projected)

    return projected


@router.get("/city/cache")
async def list_cache(authorization: Optional[str] = Header(None)):
    """List all cached cities."""
    from app.core.config import settings
    _verify_token(authorization, settings.token)

    await init_db()
    cities = await list_cached_cities()
    return cities


@router.delete("/city/cache/{cache_id}")
async def delete_cache(cache_id: int, authorization: Optional[str] = Header(None)):
    """Delete a specific cached city."""
    from app.core.config import settings
    _verify_token(authorization, settings.token)

    await init_db()
    deleted = await delete_cached_city(cache_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Cache entry not found")
    return {"deleted": True}


@router.websocket("/ws/ingest")
async def ingest_progress_ws(websocket: WebSocket):
    """
    WebSocket endpoint for streaming ingestion progress.
    Client sends: { "bbox": "N,S,E,W" }
    Server streams: { "stage": "...", "percent": 0-100, "message": "..." }
    Final message includes the full GeoJSON.
    """
    await websocket.accept()

    try:
        # Receive bbox from client
        data = await websocket.receive_json()
        bbox_str = data.get("bbox", "")

        if not bbox_str:
            await websocket.send_json({"error": "Missing bbox parameter"})
            await websocket.close()
            return

        # Parse bbox
        try:
            bbox_obj = BBox.from_string(bbox_str)
        except ValueError as e:
            await websocket.send_json({"error": f"Invalid bbox: {str(e)}"})
            await websocket.close()
            return

        # Ensure DB is initialized
        await init_db()

        # Check cache first
        cached = await get_cached_city(bbox_str)
        if cached:
            await websocket.send_json({
                "stage": "complete",
                "percent": 100,
                "message": "Loaded from cache",
                "data": cached,
            })
            await websocket.close()
            return

        # Progress callback — sends updates to WebSocket
        async def send_progress(stage: str, percent: float, message: str):
            try:
                await websocket.send_json({
                    "stage": stage,
                    "percent": round(percent, 1),
                    "message": message,
                })
            except Exception:
                pass  # WebSocket may have closed

        # Step 1: Query Overpass
        try:
            overpass_bbox = bbox_obj.to_overpass_string()
            raw_data = await query_overpass(overpass_bbox, on_progress=send_progress)
        except OverpassError as e:
            await websocket.send_json({"error": str(e)})
            await websocket.close()
            return

        # Step 2: Normalize
        await send_progress("processing", 40, "Normalizing OpenStreetMap data…")
        geojson = normalize_overpass_response(raw_data)

        if not geojson.get("features"):
            await websocket.send_json({
                "error": "No features found in this area"
            })
            await websocket.close()
            return

        # Step 3: Project
        await send_progress("building_geometry", 60, "Projecting coordinates…")
        center_lon, center_lat = compute_bbox_center(
            bbox_obj.north, bbox_obj.south, bbox_obj.east, bbox_obj.west
        )
        projected = project_geojson(geojson, center_lon, center_lat)
        projected["bbox"] = [bbox_obj.west, bbox_obj.south, bbox_obj.east, bbox_obj.north]

        # Step 4: Cache
        await send_progress("caching", 85, "Saving to local database…")
        city_name = f"City @ {bbox_obj.north:.4f},{bbox_obj.east:.4f}"
        await cache_city(bbox_str, city_name, projected)

        # Step 5: Complete
        await send_progress("complete", 100, f"Loaded {len(projected['features'])} features")

        # Send final data
        await websocket.send_json({
            "stage": "complete",
            "percent": 100,
            "message": "City loaded successfully",
            "data": projected,
        })

    except WebSocketDisconnect:
        logger.info("Ingest WebSocket disconnected by client")
    except Exception as e:
        logger.error(f"Ingest WebSocket error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
