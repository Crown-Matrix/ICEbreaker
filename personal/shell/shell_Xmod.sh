#!/usr/bin/env bash

#script must be run from /icebreaker directory
pwd_dir=${PWD##*/}

if [[ ! ${pwd_dir,,} == "icebreaker" ]]; then
    echo "script must be run from the icebreaker directory"
    exit 1
fi


find ./personal/shell/ -type f -name "*.sh" -exec chmod +x {} +
