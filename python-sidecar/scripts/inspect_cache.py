#!/usr/bin/env python3
"""
Diagnostic script — inspect the first cached city entry in SQLite.

Usage:
    python scripts/inspect_cache.py [path/to/city_cache.db]

Not a pytest test.  Placed under scripts/ to avoid pytest discovery.
"""
import sqlite3
import json
import sys
import os


def main():
    db_path = sys.argv[1] if len(sys.argv) > 1 else "city_cache.db"

    if not os.path.exists(db_path):
        print(f"Database not found: {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # List tables so we don't crash on schema mismatch
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]
    print(f"Tables: {tables}")

    if "cities" not in tables:
        print("'cities' table not found — cache may not have been initialized yet.")
        conn.close()
        sys.exit(0)

    cur.execute("SELECT COUNT(*) FROM cities")
    count = cur.fetchone()[0]
    print(f"Cached cities: {count}")

    if count == 0:
        print("No cached entries.")
        conn.close()
        sys.exit(0)

    cur.execute("SELECT geojson FROM cities LIMIT 1")
    row = cur.fetchone()
    data = json.loads(row[0])
    print(f"Features in first entry: {len(data.get('features', []))}")
    if data.get("features"):
        print(json.dumps(data["features"][0], indent=2))

    conn.close()


if __name__ == "__main__":
    main()
