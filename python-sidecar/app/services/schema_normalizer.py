"""
Schema normalizer — converts raw Overpass API JSON elements into
a normalized GeoJSON FeatureCollection with consistent properties.
Fills missing tags with intelligent defaults.
"""
from typing import Optional
from app.core.logger import logger

# Default building height assumptions
DEFAULT_BUILDING_LEVELS = 3
DEFAULT_LEVEL_HEIGHT_M = 3.5
DEFAULT_BUILDING_HEIGHT_M = DEFAULT_BUILDING_LEVELS * DEFAULT_LEVEL_HEIGHT_M

# Road width by highway type (meters)
HIGHWAY_WIDTHS = {
    "motorway": 14.0,
    "trunk": 12.0,
    "primary": 10.0,
    "secondary": 8.0,
    "tertiary": 7.0,
    "residential": 6.0,
    "service": 4.0,
    "footway": 2.0,
    "path": 1.5,
    "cycleway": 2.0,
    "unclassified": 5.0,
}


def normalize_overpass_response(raw_data: dict, on_progress=None) -> dict:
    """
    Convert raw Overpass JSON to a GeoJSON FeatureCollection.

    The Overpass API returns a flat list of elements (nodes, ways, relations).
    We need to:
    1. Build a node lookup table (id → lat/lon)
    2. Convert ways to GeoJSON polygons (buildings, landuse) or linestrings (roads)
    3. Convert amenity nodes to GeoJSON points
    4. Normalize properties with defaults

    Returns:
        GeoJSON FeatureCollection dict
    """
    elements = raw_data.get("elements", [])
    if not elements:
        logger.warning("No elements in Overpass response")
        return {"type": "FeatureCollection", "features": [], "metadata": {"feature_count": 0}}

    # Step 1: Build node and way indices
    nodes = {}
    ways_dict = {}
    features_to_process = []
    for el in elements:
        if el["type"] == "node":
            nodes[el["id"]] = (el.get("lon", 0), el.get("lat", 0))
            # If it has tags, it might be a POI (amenity, shop, etc.)
            if el.get("tags"):
                features_to_process.append(el)
        elif el["type"] == "way":
            ways_dict[el["id"]] = el
            if el.get("tags"):
                features_to_process.append(el)
        elif el["type"] == "relation":
            if el.get("tags", {}).get("type") == "multipolygon" and el.get("tags"):
                features_to_process.append(el)

    logger.info(f"Node index: {len(nodes)} nodes, {len(ways_dict)} ways, {len(features_to_process)} features to process")

    # Step 2: Convert to GeoJSON features
    features = []
    for i, el in enumerate(features_to_process):
        feature_or_list = _convert_element(el, nodes, ways_dict)
        if feature_or_list:
            if isinstance(feature_or_list, list):
                features.extend(feature_or_list)
            else:
                features.append(feature_or_list)

    # Deduplicate by OSM ID (while grouping segments)
    seen_ids = set()
    unique_features = []
    for f in features:
        # if a road was split, we append "_seg0", etc. so osm_id acts as group identifier
        unique_id = f["properties"].get("_unique_id", f["properties"]["osm_id"])
        if unique_id not in seen_ids:
            seen_ids.add(unique_id)
            unique_features.append(f)

    logger.info(f"Normalized {len(unique_features)} features ({len(features) - len(unique_features)} duplicates removed)")

    # Compute stats
    buildings = sum(1 for f in unique_features if f["properties"]["osm_type"] == "building")
    roads = sum(1 for f in unique_features if f["properties"]["osm_type"] == "highway")
    landuse = sum(1 for f in unique_features if f["properties"]["osm_type"] == "landuse")
    amenities = sum(1 for f in unique_features if f["properties"]["osm_type"] == "amenity")

    metadata = {
        "feature_count": len(unique_features),
        "buildings": buildings,
        "roads": roads,
        "landuse": landuse,
        "amenities": amenities,
    }

    logger.info(f"Feature breakdown: {metadata}")

    return {
        "type": "FeatureCollection",
        "features": unique_features,
        "metadata": metadata,
    }


def _convert_element(el: dict, nodes: dict, ways_dict: dict) -> Optional[dict]:
    """Convert a single Overpass element to a GeoJSON feature."""
    tags = el.get("tags", {})
    el_type = el["type"]
    osm_id = el["id"]

    # Determine the feature category
    category = _categorize(tags)
    if not category:
        return None

    # Build geometry
    if el_type == "node":
        geometry = {
            "type": "Point",
            "coordinates": [el.get("lon", 0), el.get("lat", 0)],
        }
    elif el_type == "way":
        node_refs = el.get("nodes", [])
        is_closed = len(node_refs) > 2 and node_refs[0] == node_refs[-1]

        if is_closed and category in ("building", "landuse", "water"):
            coords = []
            for nid in node_refs:
                if nid in nodes:
                    coords.append(list(nodes[nid]))
            if len(coords) < 3:
                return None
            geometry = {
                "type": "Polygon",
                "coordinates": [coords],
            }
        else:
            # Roads and open paths -> split them if nodes are missing
            segments = []
            current_seg = []
            for nid in node_refs:
                if nid in nodes:
                    current_seg.append(list(nodes[nid]))
                else:
                    if len(current_seg) >= 2:
                        segments.append(current_seg)
                    current_seg = []
            if len(current_seg) >= 2:
                segments.append(current_seg)

            if not segments:
                return None

            properties = _normalize_properties(osm_id, category, tags, el_type)

            if len(segments) == 1:
                return {
                    "type": "Feature",
                    "geometry": {
                        "type": "LineString",
                        "coordinates": segments[0],
                    },
                    "properties": properties,
                }
            else:
                # Return multiple contiguous features
                multi_features = []
                for idx, seg in enumerate(segments):
                    seg_props = dict(properties)
                    seg_props["_unique_id"] = f"{osm_id}_seg{idx}"
                    multi_features.append({
                        "type": "Feature",
                        "geometry": {
                            "type": "LineString",
                            "coordinates": seg,
                        },
                        "properties": seg_props,
                    })
                return multi_features
    elif el_type == "relation":
        outer_ways = []
        inner_ways = []
        for member in el.get("members", []):
            if member["type"] == "way" and member["ref"] in ways_dict:
                way_el = ways_dict[member["ref"]]
                coords = [list(nodes[nid]) for nid in way_el.get("nodes", []) if nid in nodes]
                if coords:
                    role = member.get("role", "outer")
                    if role == "inner":
                        inner_ways.append(coords)
                    else:
                        outer_ways.append(coords)
                        
        outer_rings = _stitch_ways(outer_ways)
        inner_rings = _stitch_ways(inner_ways)
        
        polygons = []
        for outer in outer_rings:
            if len(outer) >= 4:
                # GeoJSON Polygon mapping: [outer_ring, inner1, inner2...]
                poly = [outer]
                poly.extend([inner for inner in inner_rings if len(inner) >= 4])
                polygons.append(poly)
                
        if not polygons:
            return None
            
        properties = _normalize_properties(osm_id, category, tags, el_type)
        if len(polygons) == 1:
            geometry = {"type": "Polygon", "coordinates": polygons[0]}
        else:
            geometry = {"type": "MultiPolygon", "coordinates": polygons}
            
        return {
            "type": "Feature",
            "geometry": geometry,
            "properties": properties,
        }
    else:
        return None

    # Build normalized properties for polygons and points
    properties = _normalize_properties(osm_id, category, tags, el_type)

    return {
        "type": "Feature",
        "geometry": geometry,
        "properties": properties,
    }


def _stitch_ways(ways: list) -> list:
    """Stitch a sequence of way segments into complete rings."""
    if not ways: return []
    rings = []
    pool = list(ways)
    
    while pool:
        current_ring = list(pool.pop(0))
        
        while True:
            # Reached a closed ring?
            if current_ring[0] == current_ring[-1] and len(current_ring) > 2:
                rings.append(current_ring)
                break
                
            merged = False
            for i in range(len(pool)):
                w = pool[i]
                if current_ring[-1] == w[0]:
                    current_ring.extend(w[1:])
                    pool.pop(i)
                    merged = True
                    break
                elif current_ring[-1] == w[-1]:
                    current_ring.extend(reversed(w[:-1]))
                    pool.pop(i)
                    merged = True
                    break
                elif current_ring[0] == w[-1]:
                    current_ring = w[:-1] + current_ring
                    pool.pop(i)
                    merged = True
                    break
                elif current_ring[0] == w[0]:
                    current_ring = list(reversed(w[1:])) + current_ring
                    pool.pop(i)
                    merged = True
                    break
                    
            if not merged:
                # Close it forcibly if unclosed due to bad mapping
                if current_ring[0] != current_ring[-1]:
                    current_ring.append(current_ring[0])
                rings.append(current_ring)
                break
    return rings


def _categorize(tags: dict) -> Optional[str]:
    """Determine the primary category of an OSM element."""
    if "building" in tags:
        return "building"
    if "highway" in tags:
        return "highway"
    if "landuse" in tags:
        return "landuse"
    if "natural" in tags and tags["natural"] in ("water", "coastline"):
        return "water"
    if "waterway" in tags:
        return "water"
    if "amenity" in tags:
        return "amenity"
    return None


# Friendly labels for the raw "building" tag values
_BUILDING_TYPE_LABELS = {
    "yes": "Building",
    "residential": "Residential Building",
    "commercial": "Commercial Building",
    "industrial": "Industrial Building",
    "retail": "Retail Building",
    "apartments": "Apartment Block",
    "house": "House",
    "detached": "Detached House",
    "terrace": "Terrace House",
    "office": "Office Building",
    "school": "School",
    "university": "University Building",
    "hospital": "Hospital",
    "church": "Church",
    "mosque": "Mosque",
    "temple": "Temple",
    "warehouse": "Warehouse",
    "garage": "Garage",
    "shed": "Shed",
    "roof": "Roof Structure",
    "hut": "Hut",
    "cabin": "Cabin",
    "hotel": "Hotel",
    "dormitory": "Dormitory",
    "cathedral": "Cathedral",
}

# Friendly labels for highway types
_HIGHWAY_TYPE_LABELS = {
    "motorway": "Motorway",
    "trunk": "Trunk Road",
    "primary": "Primary Road",
    "secondary": "Secondary Road",
    "tertiary": "Tertiary Road",
    "residential": "Residential Street",
    "service": "Service Road",
    "footway": "Footpath",
    "cycleway": "Cycle Path",
    "path": "Path",
    "unclassified": "Road",
    "living_street": "Living Street",
    "pedestrian": "Pedestrian Way",
    "track": "Track",
    "motorway_link": "Motorway Ramp",
    "trunk_link": "Trunk Road Ramp",
    "primary_link": "Primary Road Ramp",
    "secondary_link": "Secondary Road Ramp",
}


def _generate_building_name(osm_id: int, tags: dict, levels: int, height: float) -> str:
    """Generate a human-friendly name for a building when OSM name tag is absent."""
    # 1. Use the actual OSM name if present
    name = tags.get("name")
    if name:
        return name

    # 2. Build from address components
    addr_parts = []
    house_number = tags.get("addr:housenumber")
    street = tags.get("addr:street")
    if house_number:
        addr_parts.append(house_number)
    if street:
        addr_parts.append(street)
    address_str = " ".join(addr_parts) if addr_parts else None

    # 3. Building type label
    btype = tags.get("building", "yes")
    type_label = _BUILDING_TYPE_LABELS.get(btype, btype.replace("_", " ").title())

    # 4. Compose: "Apartment Block, 42 Main St" or "Residential Building (3F)"
    if address_str:
        return f"{type_label}, {address_str}"
    return f"{type_label} ({levels}F)"


def _generate_road_name(osm_id: int, tags: dict, highway_type: str) -> str:
    """Generate a human-friendly name for a road when OSM name tag is absent."""
    # 1. Use the actual OSM name if present
    name = tags.get("name")
    if name:
        return name

    # 2. Use ref number (e.g., "NH44", "M25")
    ref = tags.get("ref")
    type_label = _HIGHWAY_TYPE_LABELS.get(highway_type, highway_type.replace("_", " ").title())
    if ref:
        return f"{type_label} {ref}"

    # 3. Surface info
    surface = tags.get("surface")
    if surface:
        return f"{type_label} ({surface})"

    return type_label


def _normalize_properties(osm_id: int, category: str, tags: dict, el_type: str = "node") -> dict:
    """Build normalized properties dict with defaults."""
    props = {
        "osm_id": osm_id,
        "osm_type": category,
        "osm_element_type": el_type,
        "name": tags.get("name"),
        "tags": tags,
    }

    if category == "building":
        # Extract levels
        levels = _safe_int(tags.get("building:levels"))
        if levels is None:
            levels = DEFAULT_BUILDING_LEVELS

        # Extract height
        height = _safe_float(tags.get("height"))
        if height is None:
            height = levels * DEFAULT_LEVEL_HEIGHT_M

        props["building_levels"] = levels
        props["height"] = height
        props["building_type"] = tags.get("building", "yes")
        props["address"] = _build_address(tags)
        props["display_name"] = _generate_building_name(osm_id, tags, levels, height)

    elif category == "highway":
        highway_type = tags.get("highway", "unclassified")
        props["highway_type"] = highway_type
        props["lanes"] = _safe_int(tags.get("lanes"))
        props["surface"] = tags.get("surface")
        props["road_width"] = HIGHWAY_WIDTHS.get(highway_type, 5.0)
        props["display_name"] = _generate_road_name(osm_id, tags, highway_type)

    elif category == "landuse":
        props["landuse"] = tags.get("landuse")

    elif category == "water":
        props["water_type"] = tags.get("waterway") or tags.get("natural", "water")
        if "width" in tags:
            props["width"] = _safe_float(tags["width"])

    elif category == "amenity":
        props["amenity"] = tags.get("amenity")
        props["display_name"] = tags.get("name") or tags.get("amenity", "").replace("_", " ").title()

    return props


def _build_address(tags: dict) -> str | None:
    """Build a one-line address string from addr:* tags."""
    parts = []
    for key in ("addr:housenumber", "addr:street", "addr:suburb", "addr:city"):
        val = tags.get(key)
        if val:
            parts.append(val)
    return ", ".join(parts) if parts else None


def _safe_int(value) -> Optional[int]:
    """Safely convert a value to int, return None on failure."""
    if value is None:
        return None
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def _safe_float(value) -> Optional[float]:
    """Safely convert a value to float, return None on failure."""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
