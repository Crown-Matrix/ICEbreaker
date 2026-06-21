#!/usr/bin/env bash


#script must be run from /icebreaker directory
pwd_dir=${PWD##*/}

if [[ ! ${pwd_dir,,} == "icebreaker" ]]; then
    echo "script must be run from the icebreaker directory"
    exit 1
fi

#create database directory in private/
mkdir -p ./private/database


#initialize database using thee sql.cjs code.

# use node to run the sql function

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

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    if [ -n "$result" ]; then
    echo -e "\nSQL.cjs function output: $result"
else
    echo -e "\nSQL.cjs function output: undefined"
fi

if [ "$node_exit" -eq 0 ]; then
    echo -e "\nShell output: 0 (Success)\n"
else
    echo -e "\nError:\n $result\n"
fi
else
    #being sourced
    #only show output if there is an error, otherwise be silent
    if [ "$node_exit" -ne 0 ]; then
    echo -e "\nError:\n $result\n"
    fi
fi