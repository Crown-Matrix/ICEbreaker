#!/usr/bin/env bash

#move up to the outermost directory to ensure user is originating from the correct directory
dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
found=0

while [[ "$dir" != "/" ]]; do
    base="$(basename "$dir")"
    #if this doesnt work because of a "bad substitution" ensure the env bash is updated (4+)
    # bash --version ; which -a bash ;
    if [[ "${base,,}" == "icebreaker" ]]; then
        cd "$dir" || exit 1
        found=1
        break
    fi
    dir="$(dirname "$dir")"
done

if [[ "$found" -ne 1 ]]; then
    echo "icebreaker directory not found"
    exit 1
fi

#at this point, icebreaker directory has been found and cd'd to


#move to the directory with the sql functions and intended database directory location
cd ./private  || exit 1


#create database directory in private/
mkdir -p database


#initialize database using thee sql.cjs code.
# i should probably like use node to both import the sql and run it
cd ./admin-js || exit 1


# use node to run the sql function

result=$(node -e "
const { initializeAllTables } = require('./SQL.cjs');

Promise.resolve()
  .then(() => initializeAllTables())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
" 2>&1)
node_exit=$?



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
