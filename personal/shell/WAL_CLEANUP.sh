#!/usr/bin/env bash

set -euo pipefail

DB_PATH="${1:-/Users/danielsandoval/Desktop/ICEbreaker/private/database/ICEbreaker.db}"

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

echo "Done. Restart the app."