"""
Spatial processor — coordinate transforms and polygon operations.
Converts WGS84 lat/lon to local Cartesian coordinates for 3D rendering.
"""
import math
from typing import Optional
from app.core.logger import logger


# Earth radius in meters (WGS84 approximation)
EARTH_RADIUS_M = 6378137.0


def web_mercator_project(lon: float, lat: float, origin_lon: float, origin_lat: float) -> tuple[float, float]:
    """
    Project a single lat/lon point to local Cartesian (x, y) in meters,
    relative to a given origin point using Web Mercator math.

    Args:
        lon, lat: Point to project
        origin_lon, origin_lat: Origin (center of city bbox)

    Returns:
        (x, y) in meters from origin
    """
    # Convert degrees to meters using Mercator approximation
    x = (lon - origin_lon) * (math.pi / 180) * EARTH_RADIUS_M * math.cos(math.radians(origin_lat))
    y = (lat - origin_lat) * (math.pi / 180) * EARTH_RADIUS_M
    return (round(x, 3), round(y, 3))


def project_geojson(geojson: dict, origin_lon: float, origin_lat: float) -> dict:
    """
    Transform all coordinates in a GeoJSON FeatureCollection from
    WGS84 lat/lon to local Cartesian (meters from origin).

    Args:
        geojson: GeoJSON FeatureCollection
        origin_lon, origin_lat: Center point of the bounding box

    Returns:
        New GeoJSON FeatureCollection with projected coordinates
    """
    projected_features = []

    for feature in geojson.get("features", []):
        geom = feature.get("geometry", {})
        geom_type = geom.get("type", "")
        coords = geom.get("coordinates")

        if not coords:
            continue

        projected_coords = _project_coords(coords, geom_type, origin_lon, origin_lat)

        projected_features.append({
            "type": "Feature",
            "geometry": {
                "type": geom_type,
                "coordinates": projected_coords,
            },
            "properties": feature.get("properties", {}),
        })

    logger.info(f"Projected {len(projected_features)} features to local Cartesian")

    result = {
        "type": "FeatureCollection",
        "features": projected_features,
        "metadata": geojson.get("metadata", {}),
    }

    # Add origin to metadata for the renderer
    result["metadata"]["origin"] = {
        "lon": origin_lon,
        "lat": origin_lat,
    }

    return result


def _project_coords(coords, geom_type: str, origin_lon: float, origin_lat: float):
    """Recursively project coordinates based on geometry type."""
    if geom_type == "Point":
        # coords = [lon, lat]
        x, y = web_mercator_project(coords[0], coords[1], origin_lon, origin_lat)
        return [x, y, 0]

    elif geom_type == "LineString":
        # coords = [[lon, lat], ...]
        return [
            [*web_mercator_project(c[0], c[1], origin_lon, origin_lat), 0]
            for c in coords
        ]

    elif geom_type == "Polygon":
        # coords = [[[lon, lat], ...], ...]  (outer ring + holes)
        return [
            [
                [*web_mercator_project(c[0], c[1], origin_lon, origin_lat), 0]
                for c in ring
            ]
            for ring in coords
        ]

    return coords


def compute_bbox_center(north: float, south: float, east: float, west: float) -> tuple[float, float]:
    """Compute the centroid of a bounding box. Returns (lon, lat)."""
    center_lat = (north + south) / 2
    center_lon = (east + west) / 2
    return (center_lon, center_lat)
