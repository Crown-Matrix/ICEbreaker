#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DB_PATH="${SCRIPT_DIR}/../../private/database/ICEbreaker.db"

DB_PATH="${1:-$DEFAULT_DB_PATH}"

echo "Target database: $DB_PATH"

if [ ! -f "$DB_PATH" ]; then
    echo "Warning: main db file not found at $DB_PATH"
fi

for suffix in "-wal" "-shm"; do
    file="${DB_PATH}${suffix}"

    if [ -f "$file" ]; then
        echo "Removing $file"
        rm -f -- "$file"
    else
        echo "Not found: $file"
    fi
done

echo "SQL Cleanup Done. Restart the app."