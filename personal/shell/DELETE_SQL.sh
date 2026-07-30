#!/usr/bin/env bash

set -euo pipefail


# Not wired into the app — run manually when you want a clean local reset.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_DB_PATH="${SCRIPT_DIR}/../../private/database/ICEbreaker.db"
ENV_PATH="${SCRIPT_DIR}/../../.env"

DB_PATH="${1:-$DEFAULT_DB_PATH}"

echo "Target database: $DB_PATH"

for suffix in "" "-wal" "-shm" "-info"; do
    file="${DB_PATH}${suffix}"

    if [ -f "$file" ]; then
        echo "Removing $file"
        rm -f -- "$file"
    else
        echo "Not found: $file"
    fi
done


# Reset LAST_SQL_MODE to 'undefined' in .env so that a fresh sync will be triggered on next run
if [ -f "$ENV_PATH" ]; then
    echo "Resetting LAST_SQL_MODE in $ENV_PATH"
    awk -v key="LAST_SQL_MODE" -v val="undefined" '
        BEGIN { done = 0 }
        {
            if ($0 ~ "^[[:space:]]*" key "[[:space:]]*=") {
                sub(/=.*/, "=\x27" val "\x27")
                done = 1
            }
            print
        }
        END {
            if (!done) print key "=\x27" val "\x27"
        }
    ' "$ENV_PATH" > "${ENV_PATH}.tmp" && mv "${ENV_PATH}.tmp" "$ENV_PATH"
else
    echo "Warning: .env not found at $ENV_PATH — skipping LAST_SQL_MODE reset"
fi

echo "Done. Restart the app to trigger a fresh sync."