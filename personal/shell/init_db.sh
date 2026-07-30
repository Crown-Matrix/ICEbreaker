#!/usr/bin/env bash


#script must be run from /icebreaker directory
pwd_dir="${PWD##*/}"
pwd_dir_lower=$(echo "$pwd_dir" | tr '[:upper:]' '[:lower:]')

if [[ ! ( "$pwd_dir_lower" == "icebreaker" || "$pwd_dir_lower" == "src" ) ]]; then
    echo "script must be run from the main directory"
    exit 1
fi

# personal/shell/init_db.sh
#create database directory in private/
mkdir -p ./private/database

# Only bootstrap with better-sqlite3 in no_turso mode. In turso mode,
# tracked-SQL.cjs's `new sql(dbPath, { syncUrl, authToken })` needs to be
# the FIRST thing to touch this file, or libSQL has no metadata to work
# with and throws InvalidLocalState.
if [ "$USE_TURSO_DATABASE" == "true" ]; then
    result="Skipping local SQLite bootstrap (USE_TURSO_DATABASE=true) — tracked-SQL.cjs will create the replica via sync."
    node_exit=0
else
    touch ./private/database/ICEbreaker.db
    result=$(node -e "
const { initializeAllTables } = require('./private/admin-js/SQL.cjs');

Promise.resolve()
  .then(() => initializeAllTables())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
" 2>&1)
    node_exit=$?
fi