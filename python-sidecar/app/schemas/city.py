"""
Pydantic schemas for city data endpoints.
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
from datetime import datetime


class BBox(BaseModel):
    """Bounding box in lat/lon — N,S,E,W format."""
    north: float = Field(..., ge=-90, le=90, description="Northern latitude")
    south: float = Field(..., ge=-90, le=90, description="Southern latitude")
    east: float = Field(..., ge=-180, le=180, description="Eastern longitude")
    west: float = Field(..., ge=-180, le=180, description="Western longitude")

    @field_validator("north")
    @classmethod
    def north_gt_south(cls, v, info):
        if "south" in info.data and v <= info.data["south"]:
            raise ValueError("North must be greater than south")
        return v

    @property
    def area_km2(self) -> float:
        """Approximate area in km² using simple lat/lon scaling."""
        lat_diff = abs(self.north - self.south)
        lon_diff = abs(self.east - self.west)
        # 1 degree lat ≈ 111km, 1 degree lon ≈ 111km * cos(lat)
        import math
        avg_lat = (self.north + self.south) / 2
        return (lat_diff * 111) * (lon_diff * 111 * math.cos(math.radians(avg_lat)))

    def to_overpass_string(self) -> str:
        """Format as Overpass API bbox string: south,west,north,east."""
        return f"{self.south},{self.west},{self.north},{self.east}"

    @classmethod
    def from_string(cls, bbox_str: str) -> "BBox":
        """Parse 'N,S,E,W' string into BBox."""
        parts = [float(x.strip()) for x in bbox_str.split(",")]
        if len(parts) != 4:
            raise ValueError("BBox must have 4 values: N,S,E,W")
        return cls(north=parts[0], south=parts[1], east=parts[2], west=parts[3])


class CityFeatureProperties(BaseModel):
    """Normalized properties for a city feature."""
    osm_id: int
    osm_type: str = ""                    # "building", "highway", "landuse", "amenity"
    name: Optional[str] = None
    building_levels: Optional[int] = None
    height: Optional[float] = None        # meters
    highway_type: Optional[str] = None    # "motorway", "primary", "secondary", "residential"
    landuse: Optional[str] = None
    amenity: Optional[str] = None
    surface: Optional[str] = None
    lanes: Optional[int] = None
    tags: dict[str, str] = Field(default_factory=dict)  # All raw OSM tags


class CityFeatureSchema(BaseModel):
    """A single GeoJSON Feature with normalized properties."""
    type: str = "Feature"
    geometry: dict[str, Any]
    properties: CityFeatureProperties


class CityResponse(BaseModel):
    """Full city data response — GeoJSON FeatureCollection."""
    type: str = "FeatureCollection"
    features: list[CityFeatureSchema] = Field(default_factory=list)
    bbox: list[float] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class CacheEntry(BaseModel):
    """Cached city entry metadata."""
    id: int
    name: str
    bbox: str
    size_mb: float
    cached_at: datetime
    feature_count: int


class IngestProgress(BaseModel):
    """Progress event during city ingestion."""
    stage: str       # "querying", "processing", "building_geometry", "caching"
    percent: float   # 0.0 to 100.0
    message: str = ""
