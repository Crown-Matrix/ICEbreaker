#!/usr/bin/env bash

# reset-wal.sh
# Deletes all companion files for the database (e.g. -wal, -shm, and any
# other libsql sync-metadata files matching <db>-*), clearing stale local
# sync lineage after a forcePush (WalConflict). The main .db file itself
# is left untouched.
#
# Usage: ./reset-wal.sh [path/to/database.db]
# Defaults to ../database/ICEbreaker.db relative to this script if no arg given.

set -euo pipefail

DB_PATH="${1:-/Users/danielsandoval/Desktop/ICEbreaker/private/database/ICEbreaker.db}"

echo "Target database: $DB_PATH"

if [ ! -f "$DB_PATH" ]; then
    echo "Warning: main db file not found at $DB_PATH (continuing anyway to clean up companions)."
fi

shopt -s nullglob
COMPANIONS=("${DB_PATH}"-*)
shopt -u nullglob

if [ ${#COMPANIONS[@]} -eq 0 ]; then
    echo "No companion files found (already clean)."
else
    for f in "${COMPANIONS[@]}"; do
        echo "Removing $f"
        rm -f "$f"
    done
fi

echo "Done. Restart the app so it re-syncs against a clean local WAL state."