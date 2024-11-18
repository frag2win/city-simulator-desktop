"""
SQLite database layer for caching city data.
Uses aiosqlite for async operations. SpatiaLite extension will be
loaded when available for spatial queries in later phases.
"""
import os
import json
import time
import aiosqlite
from typing import Optional
from app.core.config import settings
from app.core.logger import logger

DB_FILENAME = "city_cache.db"
CACHE_TTL_HOURS = 48  # Default cache TTL


def get_db_path() -> str:
    """Get the database file path in the user data directory."""
    if settings.data_dir:
        db_dir = settings.data_dir
    else:
        db_dir = os.path.join(os.path.expanduser("~"), ".city-simulator")

    os.makedirs(db_dir, exist_ok=True)
    return os.path.join(db_dir, DB_FILENAME)


async def init_db():
    """Initialize the database schema."""
    db_path = get_db_path()
    logger.info(f"Initializing database at {db_path}")

    async with aiosqlite.connect(db_path) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS city_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                bbox TEXT NOT NULL UNIQUE,
                geojson TEXT NOT NULL,
                feature_count INTEGER DEFAULT 0,
                size_bytes INTEGER DEFAULT 0,
                cached_at REAL NOT NULL,
                ttl_hours REAL DEFAULT 48
            )
        """)

        await db.execute("""
            CREATE INDEX IF NOT EXISTS idx_city_cache_bbox ON city_cache(bbox)
        """)

        await db.commit()
        logger.info("Database initialized successfully")


async def get_cached_city(bbox: str) -> Optional[dict]:
    """
    Look up a cached city by bounding box string.
    Returns the GeoJSON dict if cache is valid (not expired), else None.
    """
    db_path = get_db_path()

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM city_cache WHERE bbox = ?",
            (bbox,)
        )
        row = await cursor.fetchone()

        if row is None:
            logger.info(f"Cache miss for bbox: {bbox}")
            return None

        # Check TTL
        cached_at = row["cached_at"]
        ttl_hours = row["ttl_hours"]
        age_hours = (time.time() - cached_at) / 3600

        if age_hours > ttl_hours:
            logger.info(f"Cache expired for bbox: {bbox} (age: {age_hours:.1f}h, TTL: {ttl_hours}h)")
            await db.execute("DELETE FROM city_cache WHERE id = ?", (row["id"],))
            await db.commit()
            return None

        logger.info(f"Cache hit for bbox: {bbox} (age: {age_hours:.1f}h, {row['feature_count']} features)")

        try:
            return json.loads(row["geojson"])
        except json.JSONDecodeError:
            logger.error(f"Corrupted cache entry for bbox: {bbox}")
            await db.execute("DELETE FROM city_cache WHERE id = ?", (row["id"],))
            await db.commit()
            return None


async def cache_city(bbox: str, name: str, geojson: dict):
    """
    Cache city GeoJSON data.
    If an entry with the same bbox exists, it is replaced.
    """
    db_path = get_db_path()
    geojson_str = json.dumps(geojson)
    feature_count = len(geojson.get("features", []))
    size_bytes = len(geojson_str.encode("utf-8"))

    async with aiosqlite.connect(db_path) as db:
        # Upsert — delete existing, insert new
        await db.execute("DELETE FROM city_cache WHERE bbox = ?", (bbox,))
        await db.execute(
            """INSERT INTO city_cache (name, bbox, geojson, feature_count, size_bytes, cached_at, ttl_hours)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (name, bbox, geojson_str, feature_count, size_bytes, time.time(), CACHE_TTL_HOURS)
        )
        await db.commit()

    logger.info(f"Cached city '{name}' — {feature_count} features, {size_bytes / 1024:.1f} KB")


async def list_cached_cities() -> list[dict]:
    """List all cached cities with metadata."""
    db_path = get_db_path()

    if not os.path.exists(db_path):
        return []

    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, name, bbox, feature_count, size_bytes, cached_at, ttl_hours FROM city_cache ORDER BY cached_at DESC"
        )
        rows = await cursor.fetchall()

        return [
            {
                "id": row["id"],
                "name": row["name"],
                "bbox": row["bbox"],
                "feature_count": row["feature_count"],
                "size_mb": round(row["size_bytes"] / (1024 * 1024), 2),
                "cached_at": row["cached_at"],
                "ttl_hours": row["ttl_hours"],
            }
            for row in rows
        ]


async def delete_cached_city(cache_id: int) -> bool:
    """Delete a specific cached city by ID. Returns True if deleted."""
    db_path = get_db_path()

    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("DELETE FROM city_cache WHERE id = ?", (cache_id,))
        await db.commit()
        deleted = cursor.rowcount > 0

    if deleted:
        logger.info(f"Deleted cache entry {cache_id}")
    else:
        logger.warning(f"Cache entry {cache_id} not found")

    return deleted


async def clear_all_cache() -> int:
    """Clear all cached cities. Returns number of entries deleted."""
    db_path = get_db_path()

    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("DELETE FROM city_cache")
        await db.commit()
        count = cursor.rowcount

    logger.info(f"Cleared all cache — {count} entries deleted")
    return count
