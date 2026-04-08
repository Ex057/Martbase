#!/usr/bin/env python
"""Fix the alembic_version table to resolve 'Can't locate revision' error.

IMPORTANT: Stop Superset before running this script!
    - Kill any running 'superset run' process
    - Or stop the Flask development server

Usage:
    python fix_alembic_version.py
"""
import sqlite3
import os
import sys
from superset.app import create_app

# Create app to get the correct config
app = create_app()
db_uri = app.config["SQLALCHEMY_DATABASE_URI"]
print(f"Superset is using database: {db_uri}")

if not db_uri.startswith("sqlite:///"):
    print("This script only supports SQLite databases.")
    sys.exit(1)

# Extract path from URI
# sqlite:///path/to/db -> path/to/db
db_path = db_uri.replace("sqlite:///", "")

# Handle relative paths
if not os.path.isabs(db_path):
    # If relative, it's relative to the superset package or current dir depending on how it was set
    # But usually for superset.db it is absolute or relative to where superset runs
    # Let's try to resolve it relative to current working directory first
    if not os.path.exists(db_path):
         # Try relative to superset_home if it looks like a filename only
         potential_path = os.path.join("superset_home", db_path)
         if os.path.exists(potential_path):
             db_path = potential_path

print(f"Resolved database path: {db_path}")
print(f"Database exists: {os.path.exists(db_path)}")

if not os.path.exists(db_path):
    print("ERROR: Database file not found at resolved path!")
    sys.exit(1)

# Try to connect with timeout
try:
    conn = sqlite3.connect(db_path, timeout=10)
    conn.execute("PRAGMA busy_timeout = 10000")  # 10 second timeout
    cursor = conn.cursor()

    # Check current version
    print("\nCurrent alembic_version:")
    try:
        cursor.execute("SELECT * FROM alembic_version")
        rows = cursor.fetchall()
        for row in rows:
            print(f"  - {row[0]}")
    except sqlite3.OperationalError:
        print("  (Table might not exist or is locked)")

    # Delete all entries and insert only the correct one
    print("\nFixing alembic_version table...")
    cursor.execute("DELETE FROM alembic_version")
    cursor.execute("INSERT INTO alembic_version (version_num) VALUES ('add_display_order_dashboards')")
    conn.commit()

    # Verify the update
    print("\nUpdated alembic_version:")
    cursor.execute("SELECT * FROM alembic_version")
    rows = cursor.fetchall()
    for row in rows:
        print(f"  - {row[0]}")

    conn.close()
    print("\n✅ Done! Now run 'superset db upgrade' to verify.")

except sqlite3.OperationalError as e:
    if "locked" in str(e).lower():
        print("\n❌ ERROR: Database is locked!")
        print("\nPlease stop Superset first:")
        print("  1. Find the process: ps aux | grep superset")
        print("  2. Kill it: kill <PID>")
        print("  3. Or press Ctrl+C in the terminal running Superset")
        print("\nThen run this script again.")
    else:
        print(f"\n❌ ERROR: {e}")
    sys.exit(1)

