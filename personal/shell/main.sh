#!/usr/bin/env bash

#this can also be called from package.json via "npm run main"

#this must be run from the icebreaker directory
pwd_dir=${PWD##*/}

if [[ ! ${pwd_dir,,} == "icebreaker" ]]; then
    echo "script must be run from the icebreaker directory"
    exit 1
fi

#init imports
source ./personal/shell/init_db.sh || exit 1
source ./personal/shell/init_env.sh || exit 1



#get env file path to pass to node script

env_file_path=".env" #relative to the icebreaker directory

node --env-file=${env_file_path} "private/admin-js/main.cjs"
result=$? #it errors for some reason when i dont capture the exit code