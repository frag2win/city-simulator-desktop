"""
Overpass API client — queries OpenStreetMap for city features.
Handles query construction, rate limiting, retries, and error handling.
"""
import asyncio
import httpx
from typing import Optional, Callable, Awaitable
from app.core.logger import logger

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_TIMEOUT = 60  # seconds
MAX_RETRIES = 3
RETRY_DELAY = 2  # seconds


def build_overpass_query(bbox_str: str) -> str:
    """
    Build an OverpassQL query that fetches:
    - Buildings (closed ways/relations with building tag)
    - Roads (ways with highway tag)
    - Land use areas (closed ways with landuse tag)
    - Amenities (nodes with amenity tag)

    Args:
        bbox_str: Overpass bbox format "south,west,north,east"
    """
    return f"""
[out:json][timeout:{OVERPASS_TIMEOUT}][bbox:{bbox_str}];
(
  // Buildings
  way["building"](if: is_closed());
  relation["building"]["type"="multipolygon"];

  // Roads
  way["highway"];

  // Railways (Phase 3)
  way["railway"];

  // Land use / Zoning (Phase 3)
  way["landuse"](if: is_closed());
  relation["landuse"]["type"="multipolygon"];

  // Power & Industrial (Phase 3)
  way["power"](if: is_closed());
  relation["power"]["type"="multipolygon"];
  way["power"="line"];

  // Aviation (Phase 3)
  way["aeroway"](if: is_closed());
  relation["aeroway"]["type"="multipolygon"];

  // Water bodies
  way["natural"="water"](if: is_closed());
  relation["natural"="water"]["type"="multipolygon"];
  way["waterway"];
  way["waterway"="riverbank"](if: is_closed());
  relation["waterway"="riverbank"]["type"="multipolygon"];
  way["natural"="coastline"];

  // Amenities
  node["amenity"];
);
out body;
>;
out skel qt;
"""


async def query_overpass(
    bbox_str: str,
    on_progress: Optional[Callable[[str, float, str], Awaitable[None]]] = None,
) -> dict:
    """
    Query the Overpass API for all city features within a bounding box.

    Args:
        bbox_str: Overpass bbox format "south,west,north,east"
        on_progress: Optional async callback (stage, percent, message)

    Returns:
        Raw Overpass JSON response dict with 'elements' list.

    Raises:
        OverpassError: If the query fails after all retries.
    """
    query = build_overpass_query(bbox_str)

    if on_progress:
        await on_progress("querying", 0, "Connecting to Overpass API…")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            logger.info(f"Overpass query attempt {attempt}/{MAX_RETRIES}")

            if on_progress:
                await on_progress(
                    "querying",
                    10 + (attempt - 1) * 5,
                    f"Querying OpenStreetMap (attempt {attempt})…"
                )

            async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT + 10) as client:
                response = await client.post(
                    OVERPASS_URL,
                    data={"data": query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )

            if response.status_code == 200:
                data = response.json()
                element_count = len(data.get("elements", []))
                logger.info(f"Overpass returned {element_count} elements")

                if on_progress:
                    await on_progress(
                        "querying",
                        30,
                        f"Received {element_count} elements from OpenStreetMap"
                    )

                return data

            elif response.status_code == 429:
                # Rate limited — wait and retry
                retry_after = int(response.headers.get("Retry-After", RETRY_DELAY * attempt))
                logger.warning(f"Overpass rate limited, retrying in {retry_after}s")
                if on_progress:
                    await on_progress(
                        "querying",
                        10,
                        f"Rate limited — retrying in {retry_after}s…"
                    )
                await asyncio.sleep(retry_after)
                continue

            elif response.status_code == 400:
                error_text = response.text[:500]
                logger.error(f"Overpass bad request: {error_text}")
                raise OverpassError(f"Invalid query: {error_text}")

            else:
                logger.warning(f"Overpass HTTP {response.status_code}, retrying…")
                await asyncio.sleep(RETRY_DELAY * attempt)
                continue

        except httpx.TimeoutException:
            logger.warning(f"Overpass timeout on attempt {attempt}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * attempt)
                continue
            raise OverpassError("Overpass API timed out after all retries")

        except httpx.ConnectError:
            logger.warning(f"Overpass connection failed on attempt {attempt}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * attempt)
                continue
            raise OverpassError("Cannot connect to Overpass API — check internet connection")

        except Exception as e:
            if isinstance(e, OverpassError):
                raise
            logger.error(f"Unexpected error querying Overpass: {e}")
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_DELAY * attempt)
                continue
            raise OverpassError(f"Overpass query failed: {str(e)}")

    raise OverpassError("Overpass query failed after all retries")


class OverpassError(Exception):
    """Raised when an Overpass API query fails."""
    pass
